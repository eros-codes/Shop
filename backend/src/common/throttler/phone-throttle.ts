import { applyDecorators, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle, ThrottlerOptions } from '@nestjs/throttler';
import { toAsciiDigits } from '../validation/normalize';

// Two counters run side by side.
//
// `default` counts per client IP and covers every route. Its limit is high
// on purpose: Iranian mobile carriers put thousands of customers behind one
// address (CGNAT), and a tight per-IP cap turns a few busy shoppers into a
// 429 for everyone else on the same carrier.
//
// `phone` counts per mobile number and runs only on routes marked
// @PhoneThrottle - sign-in, sign-up and the code/password flows. That is
// the limit that stops guessing a password or a code, and it does not care
// how many people share an address.
export const PHONE_THROTTLER = 'phone';
const PHONE_THROTTLED = 'throttle:phone';

const reflector = new Reflector();

// The guard runs before validation, so the number is still as typed:
// Persian digits, spaces, dashes. Folded to bare digits here so "۰۹۱۲ ۱۲۳"
// and "0912-123" count against one number. A malformed number lands in a
// bucket of its own and then fails validation, so it buys nothing.
const phoneTracker = (req: Record<string, any>): string => {
  const body = req.body as { mobile?: unknown } | undefined;
  const typed = typeof body?.mobile === 'string' ? body.mobile : '';
  return `phone:${toAsciiDigits(typed).replace(/\D/g, '')}`;
};

export const phoneThrottler: ThrottlerOptions = {
  name: PHONE_THROTTLER,
  // Placeholders: every route that opts in sets its own limit.
  limit: 1,
  ttl: 60_000,
  skipIf: (context: ExecutionContext) =>
    !reflector.get<boolean | undefined>(PHONE_THROTTLED, context.getHandler()),
  getTracker: phoneTracker,
};

interface Window {
  limit: number;
  ttl: number;
}

export function PhoneThrottle(perNumber: Window, perIp: Window) {
  return applyDecorators(
    SetMetadata(PHONE_THROTTLED, true),
    Throttle({ [PHONE_THROTTLER]: perNumber, default: perIp }),
  );
}
