// The accounts the demo seed creates. Their password is printed on the
// portfolio page, so on a public demo anyone can sign in as them - which is
// the point. What must not happen is one visitor changing that password,
// demoting the only admin or deleting an account, and locking every other
// visitor out until the nightly reset.
//
// The seed and the guard both read this list, so they cannot drift apart.
export const DEMO_ACCOUNT_MOBILES: readonly string[] = [
  '09120000001', // admin
  '09120000002',
  '09120000003',
  '09120000004',
];

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

// True only on a server running DEMO_MODE, and only for the accounts above.
// A real shop never sets DEMO_MODE, so this is always false there.
export function isLockedDemoAccount(mobile?: string | null): boolean {
  return isDemoMode() && !!mobile && DEMO_ACCOUNT_MOBILES.includes(mobile);
}
