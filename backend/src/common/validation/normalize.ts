import { Transform } from 'class-transformer';

// Persian (U+06F0-06F9) and Arabic-Indic (U+0660-0669) digits. A phone's
// Persian keyboard types these, and every pattern here expects 0-9: a
// customer typing their own number "۰۹۱۲..." was told it was not a valid
// mobile number, could not sign in, and an OTP typed the same way never
// matched its hash.
const FOREIGN_DIGITS = /[۰-۹٠-٩]/g;

export function toAsciiDigits(value: string): string {
  return value.replace(FOREIGN_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

// For identifiers a person types digit by digit - mobile numbers, codes,
// postal codes: trimmed, digits made ASCII, inner spaces and dashes
// dropped ("0912 345 6789" is the same number). Never for passwords.
export const NormalizeDigits = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? toAsciiDigits(value.trim()).replace(/[\s\-‌]/g, '')
      : value,
  );

// Persian text arrives in several spellings of the same letters: Arabic
// yeh/kaf from Arabic keyboards, zero-width non-joiners, doubled spaces.
// Compared raw, "تهران" typed on one keyboard did not equal "تهران" stored
// from another.
export function normalizePersianText(value: string): string {
  return value
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‏‎]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
