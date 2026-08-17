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

const AUTH_TOKEN_PREFIX = 'ge_auth_token_';
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
  // The real API always answers JSON. Any error response without JSON is
  // infrastructure (SPA 404 page, gateway error, hosting cold-start page…)
  // and should trigger the device-local fallback instead of surfacing as a
  // confusing auth error.
  // 401/403/429 are deliberate rejections and must surface as errors, never
  // silently fall back to device-local accounts.
  if (res.status === 404 || res.status >= 500) {
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
  if (res.status === 201) {
    const data = await res.json().catch(() => ({}));
    saveUserToken(username, data.token);
    return { ok: true };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error || 'signup_failed' };
}

export async function apiSignin(username: string, password: string): Promise<{ ok: true; profile?: EvalProfile } | { ok: false; error: string }> {
  const res = await apiFetch('/auth/signin', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    saveUserToken(username, data.token);
    // Carry the user's saved evaluation details back so the evaluator can be
    // prefilled on any device they sign in from.
    const u = (data.user || {}) as Record<string, unknown>;
    const profile: EvalProfile = {};
    for (const k of ['country', 'institution', 'degree', 'field', 'purpose'] as const) {
      const v = u[k];
      if (typeof v === 'string' && v) profile[k] = v;
    }
    return { ok: true, profile: Object.keys(profile).length ? profile : undefined };
  }
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
    const res = await apiFetch('/auth/sync', { method: 'POST', body: JSON.stringify({ ...user, profile }) });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      saveUserToken(user.username, data.token);
    }
  } catch { /* offline / backend not published yet */ }
}

/** Save the signed-in user's evaluation details (school, country, intention…). */
export async function apiSaveProfile(username: string, profile: EvalProfile): Promise<void> {
  try {
    await apiFetch('/auth/profile', { method: 'POST', body: JSON.stringify({ username, profile }) });
  } catch { /* best-effort */ }
}

/**
 * Save the signed-in user's contacted-agency checkmarks. Full replace so
 * un-checking syncs too. Best-effort: errors are swallowed, localStorage
 * remains the source of truth.
 */
export async function apiSaveContacted(username: string, contacted: Record<string, string>): Promise<void> {
  const token = getUserToken(username);
  if (!token) return; // not authenticated with the backend yet — local-only
  try {
    await apiFetch('/auth/contacted', {
      method: 'POST',
      body: JSON.stringify({ username, contacted }),
      headers: { 'x-auth-token': token },
    });
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

/**
 * Save the signed-in user's roadmap step checkmarks. Full replace so
 * un-checking syncs too. Best-effort: errors are swallowed, localStorage
 * remains the source of truth.
 */
export async function apiSaveRoadmapSteps(username: string, steps: boolean[]): Promise<void> {
  const token = getUserToken(username);
  if (!token) return; // not authenticated with the backend yet — local-only
  try {
    await apiFetch('/auth/roadmap-steps', {
      method: 'POST',
      body: JSON.stringify({ username, roadmapSteps: steps }),
      headers: { 'x-auth-token': token },
    });
  } catch { /* best-effort */ }
}

/**
 * Fetch the user's roadmap step checkmarks from the central database.
 * Returns null when the backend is unavailable or the account is unknown.
 */
export async function apiFetchRoadmapSteps(username: string): Promise<boolean[] | null> {
  const token = getUserToken(username);
  if (!token) return null; // not authenticated with the backend yet
  try {
    const res = await apiFetch(`/auth/roadmap-steps?username=${encodeURIComponent(username)}`, { headers: { 'x-auth-token': token } });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data?.roadmapSteps)) return data.roadmapSteps as boolean[];
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the user's contacted-agency checkmarks from the central database.
 * Returns null when the backend is unavailable or the account is unknown.
 */
export async function apiFetchContacted(username: string): Promise<Record<string, string> | null> {
  const token = getUserToken(username);
  if (!token) return null; // not authenticated with the backend yet
  try {
    const res = await apiFetch(`/auth/contacted?username=${encodeURIComponent(username)}`, { headers: { 'x-auth-token': token } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.contacted === 'object' && data.contacted !== null && !Array.isArray(data.contacted)) {
      return data.contacted as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

export function getUserToken(username: string): string {
  try { return localStorage.getItem(AUTH_TOKEN_PREFIX + username.trim().toLowerCase()) || ''; } catch { return ''; }
}

function saveUserToken(username: string, token: unknown): void {
  if (typeof token !== 'string' || !token) return;
  try { localStorage.setItem(AUTH_TOKEN_PREFIX + username.trim().toLowerCase(), token); } catch { /* storage unavailable */ }
}
