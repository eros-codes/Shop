// Where the browser tests run. Ports of their own, so a dev server on the
// usual 3000 / 4000 / 5000 is never touched, and a database of their own
// that is dropped and seeded again at the start of every run.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = path.resolve(E2E_DIR, '..');

export const API_PORT = 3200;
export const ADMIN_PORT = 5200;
export const STORE_PORT = 5201;

export const API_URL = `http://localhost:${API_PORT}`;
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;
export const STORE_URL = `http://localhost:${STORE_PORT}`;

// Must end in _test: prepare-db.mjs drops it.
export const E2E_DATABASE = process.env.E2E_DATABASE || 'tellcall_e2e_test';

export const AUTH_DIR = path.join(E2E_DIR, '.auth');
export const TOKENS_FILE = path.join(AUTH_DIR, 'tokens.json');
export const ADMIN_STATE = path.join(AUTH_DIR, 'admin.json');
export const CUSTOMER_STATE = path.join(AUTH_DIR, 'customer.json');

// The accounts the demo seed creates (backend/src/seeds/seed-demo.ts).
// Sign-in is limited to 10 tries per number per 10 minutes, so each test
// file signs in as its own account, once, or uses the tokens saved by
// auth.setup.js.
export const PASSWORD = 'Passw0rd1';
export const ACCOUNTS = {
  admin: '09120000001',
  customer: '09120000002', // the signed-in storefront shopper
  loginTester: '09120000003', // storefront sign-in / sign-out tests
  outsider: '09120000004', // a customer knocking on the panel's door
};
