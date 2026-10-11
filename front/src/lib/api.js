// The single door to the API.
//
// Three things live here so no component has to think about them:
// the access token, the silent refresh when it expires, and turning an
// API error body into something with a `code` the UI can translate.
const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const ACCESS_TOKEN_KEY = 'tellcall.accessToken';

// Storage can refuse to work at all (private browsing on older Safari,
// site data blocked). Read at import time without a guard, that threw and
// the whole shop rendered as a blank page; now the session simply does
// not outlive the tab.
function readStoredToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

let accessToken = readStoredToken() || null;
let refreshPromise = null;
const listeners = new Set();
const tokenListeners = new Set();

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token ?? null;
  try {
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // See readStoredToken.
  }
}

// Every tab of the shop shares one session. When another tab signs out, or
// in as someone else, this one follows: a tab left open after "sign out"
// on a shared computer kept placing orders for up to fifteen minutes on
// the token it still held. (The event only fires in the *other* tabs.)
export function onTokenChange(listener) {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    // key is null when another tab cleared all of storage.
    if (event.key !== null && event.key !== ACCESS_TOKEN_KEY) return;
    accessToken = readStoredToken() || null;
    tokenListeners.forEach((listener) => listener(accessToken));
  });
}

// Lets AuthContext hear about a session that ended underneath it - a
// refresh token that was revoked, or one that expired while the tab was
// closed.
export function onSessionLost(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function sessionLost() {
  setAccessToken(null);
  listeners.forEach((listener) => listener());
}

export class ApiError extends Error {
  constructor({ status, code, message, details, fieldErrors }) {
    super(message || 'API error');
    this.status = status;
    this.code = code || 'INTERNAL_ERROR';
    this.details = details;
    this.fieldErrors = fieldErrors;
  }
}

async function parse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function toError(status, body) {
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return new ApiError({
    status,
    code: body?.code,
    message,
    details: body?.details,
    // A failed DTO comes back with one sentence per field.
    fieldErrors: Array.isArray(body?.errors)
      ? body.errors
      : Array.isArray(body?.message)
        ? body.message
        : undefined,
  });
}

// The refresh token is an http-only cookie, so the browser sends it on
// its own - there is nothing for JavaScript to hold. Only one refresh
// runs at a time, no matter how many requests hit a 401 together.
async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('refresh failed');
        const body = await parse(response);
        const token = body?.data?.accessToken;
        if (!token) throw new Error('refresh returned no token');
        setAccessToken(token);
        return token;
      } catch (error) {
        sessionLost();
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function request(
  path,
  { method = 'GET', body, auth = false, headers = {}, retry = true, signal } = {},
) {
  const requestHeaders = { ...headers };
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (auth && accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: requestHeaders,
      signal,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: String(error) });
  }

  const payload = await parse(response);

  // Only a rejected token is worth a refresh. A 401 about the request
  // itself - the current password typed wrong - used to rotate the session
  // for nothing, and sign the customer out whenever that refresh failed.
  const tokenRejected = !payload?.code || payload.code === 'UNAUTHORIZED';
  if (response.status === 401 && auth && retry && tokenRejected) {
    // The access token expired mid-session: refresh once and replay.
    try {
      await refreshSession();
      return request(path, { method, body, auth, headers, retry: false, signal });
    } catch {
      throw toError(401, payload);
    }
  }

  if (!response.ok) {
    throw toError(response.status, payload);
  }

  return payload?.data !== undefined ? payload.data : payload;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, body, options) => request(path, { ...options, method: 'DELETE', body }),
  refreshSession,
};

// Checkout sends one of these per attempt: a retried request returns the
// order it already created instead of making a second one.
export function idempotencyKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `key-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}
