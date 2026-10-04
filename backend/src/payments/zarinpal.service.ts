import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentGatewayUnavailableError,
  PaymentVerificationFailedError,
} from './payment-errors';

interface RequestResult {
  authority: string;
  paymentUrl: string;
}

export interface VerifyResult {
  refId: string;
  cardPan?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

interface ZarinpalData {
  code?: number;
  authority?: string;
  ref_id?: number | string;
  card_pan?: string;
  message?: string;
}

type ZarinpalErrors = { code?: number; message?: string } | unknown[];

interface ZarinpalBody {
  data?: ZarinpalData | null;
  errors?: ZarinpalErrors;
}

function errorCodeOf(errors: ZarinpalErrors | undefined): number | undefined {
  return errors && !Array.isArray(errors) ? errors.code : undefined;
}

@Injectable()
export class ZarinpalService {
  private readonly logger = new Logger(ZarinpalService.name);
  private readonly merchantId: string;
  private readonly apiBase: string;
  private readonly gatewayBase: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.merchantId = this.configService.get<string>('ZARINPAL_MERCHANT_ID')!;
    const sandbox =
      (this.configService.get<string>('ZARINPAL_MODE') ?? 'sandbox') ===
      'sandbox';
    const defaultApiBase = sandbox
      ? 'https://sandbox.zarinpal.com'
      : 'https://payment.zarinpal.com';
    this.apiBase =
      this.configService.get<string>('ZARINPAL_API_BASE') || defaultApiBase;
    this.gatewayBase =
      this.configService.get<string>('ZARINPAL_GATEWAY_BASE') ||
      `${defaultApiBase}/pg/StartPay`;
    this.timeoutMs =
      Number(this.configService.get<string>('ZARINPAL_TIMEOUT_MS')) ||
      DEFAULT_TIMEOUT_MS;
  }

  private async post(
    path: string,
    payload: unknown,
  ): Promise<{ response: Response; body: ZarinpalBody | null }> {
    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PaymentGatewayUnavailableError(
        `Could not reach ZarinPal: ${(error as Error).message}`,
      );
    }

    const body = (await response
      .json()
      .catch(() => null)) as ZarinpalBody | null;
    if (response.status >= 500) {
      throw new PaymentGatewayUnavailableError(
        `ZarinPal responded with ${response.status}`,
      );
    }
    return { response, body };
  }

  buildPaymentUrl(authority: string): string {
    return `${this.gatewayBase}/${authority}`;
  }

  async requestPayment(
    amount: number,
    description: string,
    callbackUrl: string,
    mobile?: string,
  ): Promise<RequestResult> {
    const { response, body } = await this.post('/pg/v4/payment/request.json', {
      merchant_id: this.merchantId,
      currency: 'IRT',
      amount,
      callback_url: callbackUrl,
      description,
      ...(mobile ? { metadata: { mobile } } : {}),
    });

    if (!response.ok || !body?.data?.authority || body.data.code !== 100) {
      this.logger.error(`ZarinPal request failed: ${JSON.stringify(body)}`);
      throw new PaymentGatewayUnavailableError(
        'Could not start a payment with ZarinPal',
      );
    }

    return {
      authority: body.data.authority,
      paymentUrl: `${this.gatewayBase}/${body.data.authority}`,
    };
  }

  async verifyPayment(
    authority: string,
    amount: number,
  ): Promise<VerifyResult> {
    const { response, body } = await this.post('/pg/v4/payment/verify.json', {
      merchant_id: this.merchantId,
      amount,
      authority,
    });

    const code = body?.data?.code ?? errorCodeOf(body?.errors);
    if (code === 100 || code === 101) {
      return {
        refId: String(body?.data?.ref_id ?? ''),
        cardPan: body?.data?.card_pan,
      };
    }

    if (!response.ok && !body) {
      throw new PaymentGatewayUnavailableError(
        `ZarinPal returned an unreadable response (${response.status})`,
      );
    }

    this.logger.error(`ZarinPal verify failed: ${JSON.stringify(body)}`);
    throw new PaymentVerificationFailedError(
      'Payment verification failed',
      typeof code === 'number' ? code : undefined,
    );
  }
}
