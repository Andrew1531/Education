// Central backend client. The site works in two modes:
//  - Server mode: the API is reachable → accounts live in the central database
//    and the admin board shows sign-ups from every visitor's device.
//  - Local mode (fallback): the API is unreachable (e.g. backend not published
//    yet, or offline) → accounts stay in this browser's localStorage exactly
//    as before.
import type { StoredUser } from './userStore';

// VITE_API_URL is baked in at build time (GitHub Actions sets it to the
// published backend URL). In the Replit dev environment the API is served
// on the same origin under /api.
const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

export interface EvalProfile {
  country?: string;
  institution?: string;
  degree?: string;
  field?: string;
  purpose?: string;
}

export interface ServerUser {
  username: string;
  email: string;
  hasSalt: boolean;
  createdAt: string;
  country: string | null;
  institution: string | null;
  degree: string | null;
  field: string | null;
  purpose: string | null;
}

export class ApiUnavailableError extends Error {
  constructor() { super('API unavailable'); this.name = 'ApiUnavailableError'; }
}

export class AdminKeyRequiredError extends Error {
  /** True when the server itself has no admin key configured yet (needs republish). */
  readonly notConfigured: boolean;
  constructor(notConfigured = false) {
    super('Admin key required');
    this.name = 'AdminKeyRequiredError';
    this.notConfigured = notConfigured;
  }
}

const ADMIN_KEY_STORAGE = 'ge_admin_api_key';
export function getAdminKey(): string { return localStorage.getItem(ADMIN_KEY_STORAGE) || ''; }
export function setAdminKey(key: string): void { localStorage.setItem(ADMIN_KEY_STORAGE, key); }

function adminHeaders(): Record<string, string> {
  const key = getAdminKey();
  return key ? { 'x-admin-key': key } : {};
}

function throwIfAdminRejected(res: Response): void {
  if (res.status === 401) throw new AdminKeyRequiredError();
  if (res.status === 503) throw new AdminKeyRequiredError(true);
}

/**
 * True when a response means "there is no backend here" rather than a real
 * API answer. On GitHub Pages without a configured backend, `/api/...`
 * returns the SPA's 404 page (HTML, status 404) — that must trigger the
 * device-local fallback, not be mistaken for an auth failure.
 */
export function isUnavailableResponse(res: { status: number; headers: { get(name: string): string | null } }): boolean {
  if ([404, 502, 503, 504].includes(res.status)) {
    const ct = res.headers.get('content-type') || '';
    return !ct.includes('application/json');
  }
  return false;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      signal: controller.signal,
    });
  } catch {
    throw new ApiUnavailableError();
  } finally {
    clearTimeout(timer);
  }
  if (isUnavailableResponse(res)) throw new ApiUnavailableError();
  return res;
}

export async function apiSignup(username: string, email: string, password: string, profile?: EvalProfile): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ username, email, password, profile }) });
  if (res.status === 201) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error || 'signup_failed' };
}

export async function apiSignin(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch('/auth/signin', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error || 'signin_failed' };
}

/**
 * Push this browser's own account (and any saved evaluation profile) to the
 * central database so it shows up on the admin board. Safe to call on every
 * visit — the server ignores duplicates. Errors are swallowed: sync is
 * best-effort and must never break the page.
 */
export async function apiSyncSelf(user: StoredUser, profile?: EvalProfile): Promise<void> {
  try {
    await apiFetch('/auth/sync', { method: 'POST', body: JSON.stringify({ ...user, profile }) });
  } catch { /* offline / backend not published yet */ }
}

/** Save the signed-in user's evaluation details (school, country, intention…). */
export async function apiSaveProfile(username: string, profile: EvalProfile): Promise<void> {
  try {
    await apiFetch('/auth/profile', { method: 'POST', body: JSON.stringify({ username, profile }) });
  } catch { /* best-effort */ }
}

export async function apiListUsers(): Promise<ServerUser[]> {
  const res = await apiFetch('/users', { headers: adminHeaders() });
  throwIfAdminRejected(res);
  if (!res.ok) throw new ApiUnavailableError();
  const data = await res.json();
  return data.users as ServerUser[];
}

/** Upload accounts that exist only in this browser so they appear on the central admin board. */
export async function apiImportUsers(users: StoredUser[]): Promise<number> {
  if (users.length === 0) return 0;
  const res = await apiFetch('/users/import', { method: 'POST', body: JSON.stringify({ users }), headers: adminHeaders() });
  throwIfAdminRejected(res);
  if (!res.ok) throw new ApiUnavailableError();
  const data = await res.json();
  return data.imported as number;
}

export async function apiDeleteUser(username: string): Promise<void> {
  const res = await apiFetch(`/users/${encodeURIComponent(username)}`, { method: 'DELETE', headers: adminHeaders() });
  throwIfAdminRejected(res);
  if (!res.ok && res.status !== 404) throw new ApiUnavailableError();
}

export async function apiResetPassword(username: string, password: string): Promise<void> {
  const res = await apiFetch(`/users/${encodeURIComponent(username)}/password`, { method: 'PATCH', body: JSON.stringify({ password }), headers: adminHeaders() });
  throwIfAdminRejected(res);
  if (!res.ok) throw new ApiUnavailableError();
}
