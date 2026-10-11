// The `test` every spec uses: Playwright's, plus a check that the page
// threw no uncaught error along the way - a blank screen in production
// usually starts as one of those.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  pageErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// A guest: no saved session.
export const GUEST = { cookies: [], origins: [] };

// A small real PNG, drawn by the browser, for upload tests.
export async function pngOf(browser, colour) {
  const page = await browser.newPage({ viewport: { width: 120, height: 120 } });
  await page.setContent(`<body style="margin:0;background:${colour}"></body>`);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}
