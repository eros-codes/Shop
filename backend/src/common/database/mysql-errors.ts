import { QueryFailedError } from 'typeorm';

export function isDuplicateEntryError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as
    { code?: string; errno?: number } | undefined;
  return driverError?.code === 'ER_DUP_ENTRY' || driverError?.errno === 1062;
}
