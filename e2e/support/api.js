// Talking to the API straight, for setting a test up and for checking what
// the UI did actually reached the server.
import { readFileSync } from 'node:fs';
import { API_URL, PASSWORD, TOKENS_FILE } from './env.js';

export async function api(method, path, { token, body, headers = {}, form } = {}) {
  const response = await fetch(API_URL + path, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, data: json?.data };
}

export async function login(mobile, password = PASSWORD) {
  const result = await api('POST', '/auth/login', { body: { mobile, password } });
  if (!result.data?.accessToken) {
    throw new Error(`Could not sign in as ${mobile}: ${result.status} ${JSON.stringify(result.json)}`);
  }
  return result.data.accessToken;
}

// Saved by auth.setup.js: { admin, customer }.
let tokens;
export function tokensFor() {
  tokens ??= JSON.parse(readFileSync(TOKENS_FILE, 'utf8'));
  return tokens;
}

export const userIdOf = (token) =>
  Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub);

// Persian (and Arabic-Indic) digits to ASCII, everything else dropped:
// "۱۲,۳۴۵ تومان" -> "12345".
export const digitsOf = (text) =>
  String(text)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '');

export const items = (data) => data?.items ?? data ?? [];

export async function walletBalance(adminToken, userId) {
  // Opens the wallet if the customer has none yet; returns it either way.
  return (await api('POST', `/wallets/user/${userId}`, { token: adminToken })).data.amount;
}

// A published product with an option on sale and enough stock to play
// with. `singleOption`: the product has just that one option, so its page
// needs no choosing before "add to basket".
export async function sellableProduct({ minStock = 3, singleOption = false } = {}) {
  const list = items((await api('GET', '/products?limit=50&inStock=true')).data);
  for (const summary of list) {
    if ((summary.stock ?? 0) < minStock) continue;
    const product = (await api('GET', `/products/${summary.id}`)).data;
    const live = (product.variants ?? []).filter((v) => v.is_active !== false);
    if (singleOption && live.length !== 1) continue;
    const variant = live.find((v) => v.stock >= minStock);
    if (variant) return { product, variant };
  }
  throw new Error(`No product with an option holding ${minStock}+ in stock`);
}

export async function variantStock(productId, variantId) {
  const product = (await api('GET', `/products/${productId}`)).data;
  return product.variants.find((v) => v.id === variantId).stock;
}

// A cash-on-delivery order, placed the way checkout places it.
export async function placeCodOrder(customerToken, { product, variant }) {
  const address = items((await api('GET', '/addresses', { token: customerToken })).data)[0];
  const lines = [{ productId: product.id, variantId: variant.id, quantity: 1 }];
  const quote = await api('POST', '/shipping/quote', {
    token: customerToken,
    body: { addressId: address.id, items: lines },
  });
  const courier = (quote.data?.options ?? []).find((o) => o.supportsCashOnDelivery);
  if (!courier) throw new Error('No cash-on-delivery courier for the customer address');
  const created = await api('POST', '/orders', {
    token: customerToken,
    headers: { 'Idempotency-Key': `e2e-cod-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
    body: { addressId: address.id, shippingMethodId: courier.methodId, payOnDelivery: true, items: lines },
  });
  if (!created.data?.id) throw new Error(`COD order refused: ${created.status} ${JSON.stringify(created.json)}`);
  return created.data;
}

// The customer's server basket, emptied.
export async function emptyBasket(customerToken) {
  const userId = userIdOf(customerToken);
  const lines = (await api('GET', `/products/basket/${userId}`, { token: customerToken })).data ?? [];
  for (const line of lines) {
    await api('DELETE', '/products/basket', {
      token: customerToken,
      body: { product_id: line.product.id, variant_id: line.variant?.id, quantity: line.quantity },
    });
  }
}

export async function basketLines(customerToken) {
  return (await api('GET', `/products/basket/${userIdOf(customerToken)}`, { token: customerToken })).data ?? [];
}
