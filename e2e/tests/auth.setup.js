// Signs the admin and the storefront customer in once, through the API, and
// hands every test their session - sign-in is rate limited per number, so
// signing in per test would trip it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { login } from '../support/api.js';
import {
  ACCOUNTS,
  ADMIN_STATE,
  ADMIN_URL,
  AUTH_DIR,
  CUSTOMER_STATE,
  STORE_URL,
  TOKENS_FILE,
} from '../support/env.js';

// Both apps keep the access token in localStorage and use it while it is
// valid (the API is started with JWT_EXPIRATION=2h for the run).
const stateWith = (origin, key, token) => ({
  cookies: [],
  origins: [{ origin, localStorage: [{ name: key, value: token }] }],
});

setup('sign in the admin and the customer', async () => {
  const admin = await login(ACCOUNTS.admin);
  const customer = await login(ACCOUNTS.customer);

  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify({ admin, customer }));
  writeFileSync(ADMIN_STATE, JSON.stringify(stateWith(ADMIN_URL, 'tellcall.admin.accessToken', admin)));
  writeFileSync(CUSTOMER_STATE, JSON.stringify(stateWith(STORE_URL, 'tellcall.accessToken', customer)));
});
