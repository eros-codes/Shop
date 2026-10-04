export interface RawQueryRunner {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

// TypeORM's query() is typed Promise<any>. Casting at each call site does
// not survive the linter's auto-fixer (an assertion from `any` is
// "unnecessary"), so the narrowing happens here, from unknown.
export async function queryRows<T>(
  runner: RawQueryRunner,
  sql: string,
  parameters?: unknown[],
): Promise<T[]> {
  const rows = await runner.query(sql, parameters);
  return (Array.isArray(rows) ? rows : []) as T[];
}
