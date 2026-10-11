import { ConfigService } from '@nestjs/config';

export const DEFAULT_RETURN_WINDOW_DAYS = 7;

// Days after delivery during which a return can be requested. Read in one
// place because the storefront shows it too (GET /shop/info).
//
// Zero is a real setting - the shop takes no returns - and `|| 7` used to
// turn it back into seven.
export function returnWindowDays(configService: ConfigService): number {
  const days = Number(configService.get<string | number>('RETURN_WINDOW_DAYS'));
  return Number.isFinite(days) && days >= 0 ? days : DEFAULT_RETURN_WINDOW_DAYS;
}
