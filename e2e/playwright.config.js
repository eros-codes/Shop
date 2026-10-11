// Browser tests for the storefront and the admin panel, against a real API
// and a real (throwaway) database.
//
//   cd e2e && npm ci && npx playwright install chromium
//   npx playwright test                    # everything
//   npx playwright test tests/admin        # one app
//
// Playwright starts all three servers itself (or reuses ones already
// running on these ports, outside CI). The API's start command first
// rebuilds the database from the demo seed - see prepare-db.mjs.
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import {
  ADMIN_PORT,
  ADMIN_STATE,
  ADMIN_URL,
  API_PORT,
  API_URL,
  CUSTOMER_STATE,
  E2E_DATABASE,
  E2E_DIR,
  ROOT_DIR,
  STORE_PORT,
  STORE_URL,
} from './support/env.js';

const CI = !!process.env.CI;

// What the API runs with. Everything that could reach the outside world is
// switched off explicitly, so a developer's own backend/.env (which the API
// also reads) can never make a test send a real SMS or report to Sentry.
const apiEnv = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  DB_DATABASE: E2E_DATABASE,
  JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || 'e2e-only-jwt-secret-0123456789abcdef0123',
  OTP_HASH_SECRET: process.env.OTP_HASH_SECRET || 'e2e-only-otp-secret-0123456789abcdef0123',
  // Long enough that no session needs refreshing during a run.
  JWT_EXPIRATION: '2h',
  BACKEND_URL: API_URL,
  FRONTEND_URL: STORE_URL,
  CORS_ORIGIN: `${STORE_URL},${ADMIN_URL}`,
  UPLOAD_DIR: path.join(E2E_DIR, '.uploads'),
  THROTTLE_STORAGE: 'memory',
  THROTTLE_LIMIT_PER_MINUTE: '5000',
  TRUST_PROXY: '',
  SMSIR_API_KEY: '',
  SMSIR_OTP_TEMPLATE_ID: '',
  SMSIR_ACCOUNT_EXISTS_TEMPLATE_ID: '',
  SMSIR_ORDER_PLACED_TEMPLATE_ID: '',
  SMSIR_ORDER_PAID_TEMPLATE_ID: '',
  SMSIR_ORDER_SENT_TEMPLATE_ID: '',
  SMSIR_ORDER_DELIVERED_TEMPLATE_ID: '',
  SMSIR_ORDER_CANCELLED_TEMPLATE_ID: '',
  SENTRY_DSN: '',
  ZARINPAL_MODE: 'sandbox',
  ZARINPAL_MERCHANT_ID: '00000000-0000-0000-0000-000000000000',
  ZARINPAL_API_BASE: 'http://127.0.0.1:9',
  ZARINPAL_GATEWAY_BASE: 'http://127.0.0.1:9',
  SWAGGER_ENABLED: 'false',
  TAX_RATE_PERCENT: '10',
  RETURN_WINDOW_DAYS: '7',
  PAYMENT_WINDOW_MINUTES: '15',
  // Shop details: a few set, a few not, so the pages are tested both ways.
  SHOP_PHONE: '021-12345678',
  SHOP_SUPPORT_HOURS: 'شنبه تا چهارشنبه، ۹ تا ۱۷',
  SHOP_TELEGRAM_URL: 'https://t.me/tellcall_e2e',
  SHOP_LEGAL_NAME: '',
  SHOP_EMAIL: '',
  SHOP_ADDRESS: '',
  SHOP_INSTAGRAM_URL: '',
  ENAMAD_ID: '',
  ENAMAD_CODE: '',
};

const frontEnv = { VITE_PROXY_TARGET: API_URL };

export default defineConfig({
  testDir: './tests',
  // The tests share one database (stock, wallet balances), so they run one
  // at a time and check differences rather than absolute numbers.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    // E2E_BROWSER_CHANNEL=chrome uses an installed Google Chrome instead of
    // the downloaded Chromium.
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'storefront',
      testDir: './tests/storefront',
      dependencies: ['setup'],
      // Most customers shop on a phone.
      use: { ...devices['Pixel 7'], baseURL: STORE_URL, storageState: CUSTOMER_STATE },
    },
    {
      name: 'admin',
      testDir: './tests/admin',
      dependencies: ['setup'],
      use: { viewport: { width: 1366, height: 900 }, baseURL: ADMIN_URL, storageState: ADMIN_STATE },
    },
  ],
  webServer: [
    {
      command: 'node ../e2e/prepare-db.mjs && npm run start',
      cwd: path.join(ROOT_DIR, 'backend'),
      url: `${API_URL}/health`,
      env: apiEnv,
      timeout: 300_000,
      reuseExistingServer: !CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --port ${STORE_PORT} --strictPort`,
      cwd: path.join(ROOT_DIR, 'front'),
      url: STORE_URL,
      env: frontEnv,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      command: `npm run dev -- --port ${ADMIN_PORT} --strictPort`,
      cwd: path.join(ROOT_DIR, 'admin'),
      url: ADMIN_URL,
      env: frontEnv,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
  ],
});
