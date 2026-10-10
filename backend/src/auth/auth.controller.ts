import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { PhoneThrottle } from '../common/throttler/phone-throttle';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password.dto';
import {
  REFRESH_TOKEN_COOKIE,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from './utils/refresh-token-cookie';
import { ApiTags } from '@nestjs/swagger';

const MINUTE = 60_000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // Per number: the real limit. Per IP: only a ceiling on one address
  // sending codes to a list of numbers - generous, because a whole
  // carrier can sit behind one address.
  @PhoneThrottle(
    { limit: 5, ttl: 10 * MINUTE },
    { limit: 30, ttl: 10 * MINUTE },
  )
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.authService.register(registerDto);
    return {
      data: result,
      message: 'Verification code sent',
    };
  }

  @PhoneThrottle(
    { limit: 10, ttl: 10 * MINUTE },
    { limit: 60, ttl: 10 * MINUTE },
  )
  @Post('verify-otp')
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, accessToken, refreshToken } =
      await this.authService.verifyOtp(verifyOtpDto);
    setRefreshTokenCookie(response, refreshToken, this.configService);
    return {
      data: { user, accessToken },
      message: 'Account verified and created successfully',
    };
  }

  @PhoneThrottle({ limit: 10, ttl: 10 * MINUTE }, { limit: 30, ttl: MINUTE })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.login(loginDto);
    setRefreshTokenCookie(response, refreshToken, this.configService);
    return { data: { accessToken }, message: 'User logged in successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = (
      request.cookies as Record<string, string> | undefined
    )?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token cookie found');
    }
    const tokens = await this.authService.refresh(refreshToken);
    setRefreshTokenCookie(response, tokens.refreshToken, this.configService);
    return {
      data: { accessToken: tokens.accessToken },
      message: 'Token refreshed successfully',
    };
  }

  // "I forgot my password": a code goes to the number. The answer is the
  // same whether or not an account exists, so this cannot be used to
  // find out which numbers are registered.
  @PhoneThrottle(
    { limit: 5, ttl: 10 * MINUTE },
    { limit: 30, ttl: 10 * MINUTE },
  )
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto.mobile);
    return {
      data: result,
      message: 'If an account exists for this number, a code has been sent',
    };
  }

  @PhoneThrottle(
    { limit: 10, ttl: 10 * MINUTE },
    { limit: 60, ttl: 10 * MINUTE },
  )
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password changed - please sign in again' };
  }

  // Changing it while signed in: the current password is required, and
  // every session is signed out afterwards. Throttled because a stolen
  // access token could otherwise be used to guess the current password.
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @UseGuards(JwtAuthGuard)
  @Patch('password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    await this.authService.changePassword(
      currentUser.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { message: 'Password changed - please sign in again' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = (
      request.cookies as Record<string, string> | undefined
    )?.[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    clearRefreshTokenCookie(response);
    return { message: 'Logged out successfully' };
  }
}
