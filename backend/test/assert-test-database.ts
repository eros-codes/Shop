// Phase 4 / bug 26: the e2e suite boots the REAL application against
// the REAL database in .env and writes rows into it. A comment asking
// people to point it at a disposable database is not a safeguard - one
// forgotten DB_DATABASE and the suite happily creates users, orders and
// schema changes in a working (or production) database.
//
// This turns that comment into a check that runs before anything
// connects.
export function assertDisposableTestDatabase(): void {
  const database = process.env.DB_DATABASE ?? '';
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to run e2e tests with NODE_ENV=production - these tests write real rows.',
    );
  }

  if (!/_test$/i.test(database)) {
    throw new Error(
      `Refusing to run e2e tests against database "${database || '(unset)'}". ` +
        'Point DB_DATABASE at a disposable database whose name ends with "_test" ' +
        '(for example ecommerce_test) before running npm run test:e2e.',
    );
  }
}
