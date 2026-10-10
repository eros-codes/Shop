import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SmsIrBody {
  status?: number;
  message?: string;
  data?: { messageId?: number | string } | null;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey?: string;
  private readonly templateId?: string;
  private readonly baseUrl: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SMSIR_API_KEY');
    this.templateId = this.configService.get<string>('SMSIR_OTP_TEMPLATE_ID');
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.baseUrl =
      this.configService.get<string>('SMSIR_API_BASE') ||
      'https://api.sms.ir/v1/send/verify';
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  // Whether a code can reach anyone at all. Outside production a code
  // that cannot be sent is printed to the console instead.
  get canSendOtp(): boolean {
    return (!!this.apiKey && !!this.templateId) || !this.isProduction;
  }

  async sendTemplate(
    mobile: string,
    templateId: string | number,
    parameters: Record<string, string>,
  ): Promise<{ delivered: boolean; messageId?: string; error?: string }> {
    if (!this.apiKey) {
      return { delivered: false, error: 'SMSIR_API_KEY is not configured' };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          mobile,
          templateId: Number(templateId),
          parameters: Object.entries(parameters).map(([name, value]) => ({
            name,
            value,
          })),
        }),
        signal: AbortSignal.timeout(5000),
      });

      const body = (await response
        .json()
        .catch(() => null)) as SmsIrBody | null;
      if (!response.ok || (body && body.status !== 1)) {
        return {
          delivered: false,
          error: `sms.ir refused the message (HTTP ${response.status}): ${JSON.stringify(body)}`,
        };
      }
      return {
        delivered: true,
        messageId: body?.data?.messageId
          ? String(body.data.messageId)
          : undefined,
      };
    } catch (error) {
      return { delivered: false, error: `sms.ir request threw: ${error}` };
    }
  }

  // Someone asked to sign up with a number that already has an account.
  // Its owner gets this instead of a code: they may have forgotten they
  // signed up, or someone else is trying their number. Optional - with no
  // template set, nothing is sent and the sign-up form's own hint ("no
  // code? you may already have an account") has to do.
  async sendAccountExists(mobile: string): Promise<void> {
    const templateId = this.configService.get<string>(
      'SMSIR_ACCOUNT_EXISTS_TEMPLATE_ID',
    );
    if (!this.apiKey || !templateId) {
      if (!this.isProduction) {
        console.log(
          `[SMS skipped] ${mobile} already has an account - no SMSIR_ACCOUNT_EXISTS_TEMPLATE_ID set`,
        );
      }
      return;
    }
    const result = await this.sendTemplate(mobile, templateId, {
      MOBILE: mobile,
    });
    if (!result.delivered) {
      throw new Error(result.error ?? 'sms.ir did not accept the message');
    }
  }

  async sendOtp(mobile: string, code: string): Promise<void> {
    if (!this.apiKey || !this.templateId) {
      if (this.isProduction) {
        this.logger.error(
          'SMSIR_API_KEY/SMSIR_OTP_TEMPLATE_ID are not configured in production',
        );
        throw new ServiceUnavailableException(
          'SMS delivery is not available right now, please try again shortly',
        );
      }
      console.log(`[OTP] Verification code for ${mobile}: ${code}`);
      return;
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          mobile,
          templateId: Number(this.templateId),
          parameters: [{ name: 'CODE', value: code }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      const body = (await response
        .json()
        .catch(() => null)) as SmsIrBody | null;

      if (!response.ok || (body && body.status !== 1)) {
        this.logger.error(
          `sms.ir send failed (HTTP ${response.status}): ${JSON.stringify(body)}`,
        );
        if (this.isProduction) {
          throw new ServiceUnavailableException(
            'SMS delivery failed, please try again shortly',
          );
        }
        console.log(`[OTP fallback] Verification code for ${mobile}: ${code}`);
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.error(`sms.ir request threw: ${error}`);
      if (this.isProduction) {
        throw new ServiceUnavailableException(
          'SMS delivery failed, please try again shortly',
        );
      }
      console.log(`[OTP fallback] Verification code for ${mobile}: ${code}`);
    }
  }
}
