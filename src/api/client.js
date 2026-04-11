/**
 * API client — all calls to bowlstracker.co.za/api/*
 *
 * Auth flow:
 *   1. Attach access token (JWT) to every request as Bearer header.
 *   2. On 401, attempt one silent refresh using the stored refresh token.
 *   3. If refresh succeeds, retry the original request once with the new token.
 *   4. If refresh fails, clear all tokens and redirect to login.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

let accessToken  = null;
let isRefreshing = false;           // prevent concurrent refresh storms
let refreshQueue = [];              // requests waiting on an in-flight refresh

// ── Token storage ─────────────────────────────────────────────────────────────

export function setTokens(access, refresh) {
  accessToken = access;
  if (access)   localStorage.setItem('bt_token', access);
  else          localStorage.removeItem('bt_token');
  if (refresh)  localStorage.setItem('bt_refresh', refresh);
  else          localStorage.removeItem('bt_refresh');
}

export function loadTokens() {
  accessToken = localStorage.getItem('bt_token');
  return !!accessToken;
}

export function clearTokens() {
  setTokens(null, null);
}

// ── Internal fetch ─────────────────────────────────────────────────────────────

async function doFetch(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== null) opts.body = JSON.stringify(body);

  return fetch(`${BASE_URL}${path}`, opts);
}

// ── Refresh logic ──────────────────────────────────────────────────────────────

async function attemptRefresh() {
  const refreshToken = localStorage.getItem('bt_refresh');
  if (!refreshToken) return false;

  const res  = await doFetch('POST', '/auth.php', { action: 'refresh', refresh_token: refreshToken }, null);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) return false;

  accessToken = data.access_token;
  localStorage.setItem('bt_token', accessToken);
  return true;
}

function drainQueue(success) {
  refreshQueue.forEach(resolve => resolve(success));
  refreshQueue = [];
}

// ── Main request ───────────────────────────────────────────────────────────────

async function request(method, path, body = null) {
  let res = await doFetch(method, path, body, accessToken);

  // Happy path
  if (res.ok) return res.json();

  // Non-401 error — parse and throw immediately
  if (res.status !== 401) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  // 401 — try refresh once, serialising concurrent calls behind a single refresh
  if (isRefreshing) {
    // Another request is already refreshing; wait for it to finish
    const refreshed = await new Promise(resolve => refreshQueue.push(resolve));
    if (!refreshed) throw new Error('Session expired. Please log in again.');
    res = await doFetch(method, path, body, accessToken);
    if (res.ok) return res.json();
    throw new Error('Request failed after token refresh');
  }

  isRefreshing = true;
  const refreshed = await attemptRefresh();
  isRefreshing = false;
  drainQueue(refreshed);

  if (!refreshed) {
    clearTokens();
    // Let the router handle the redirect — throw a typed error so pages can catch it
    const err = new Error('Session expired. Please log in again.');
    err.code  = 'AUTH_EXPIRED';
    throw err;
  }

  // Retry original request with the new token
  res = await doFetch(method, path, body, accessToken);
  if (res.ok) return res.json();

  const data = await res.json().catch(() => ({}));
  throw new Error(data.error ?? `HTTP ${res.status}`);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const api = {
  get:    (path)       => request('GET',    path, null),
  post:   (path, body) => request('POST',   path, body),
  put:    (path, body) => request('PUT',    path, body),
  delete: (path)       => request('DELETE', path, null),
};
