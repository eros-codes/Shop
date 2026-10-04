import { ValueTransformer } from 'typeorm';

function describe(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value);
}

// MySQL returns BIGINT as a string. Money columns use it, and this turns
// them back into numbers while refusing anything outside the range
// JavaScript can count exactly.
export const bigintTransformer: ValueTransformer = {
  to: (value: unknown) => value,
  from: (value: unknown): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(
        `Money value "${describe(value)}" is outside JavaScript's safe integer range`,
      );
    }
    return parsed;
  },
};
