import { useEffect, useState } from 'react';

// How long the API makes you wait between two codes for one number.
export const RESEND_SECONDS = 60;

/**
 * Seconds left before "send the code again" may be pressed. `start(n)`
 * (re)starts it; after a 429 the API's own retryAfter is the number to use.
 */
export function useCountdown() {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return [left, setLeft];
}

// The wait a 429 asked for, when it was about sending a code.
export function cooldownFrom(apiError) {
  if (apiError?.code !== 'OTP_COOLDOWN' && apiError?.code !== 'OTP_SEND_LIMIT') return 0;
  return Number(apiError.details?.retryAfter) || 0;
}
