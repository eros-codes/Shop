import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';

// A cookie is only sent back when its path is a prefix of the request path.
// Scoping this one to '/auth' looked tidy, but it meant the browser withheld
// it from every deployment where the API is not mounted at the site root -
// a storefront proxying to '/api/auth/refresh' never sent it, so refresh
// always answered "no refresh token cookie" and the customer was silently
// signed out the moment their access token expired, mid-checkout included.
// '/' is the only path that holds for both layouts. The cookie stays
// httpOnly, so widening the path does not expose it to scripts.
const REFRESH_TOKEN_PATH = '/';

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
    path: REFRESH_TOKEN_PATH,
    maxAge: days * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshTokenCookie(response: Response): void {
  // Must match the path the cookie was written with, or the browser keeps it.
  response.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_PATH });
}
