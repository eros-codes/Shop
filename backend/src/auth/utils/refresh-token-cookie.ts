import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';

export function setRefreshTokenCookie(
  response: Response,
  token: string,
  configService: ConfigService,
): void {
  const days = Number(configService.get('REFRESH_TOKEN_EXPIRATION_DAYS') ?? 30);

  response.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: days * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshTokenCookie(response: Response): void {
  response.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/auth' });
}
