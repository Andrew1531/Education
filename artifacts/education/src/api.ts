// Central backend client. The site works in two modes:
//  - Server mode: the API is reachable → accounts live in the central database
//    and the admin board shows sign-ups from every visitor's device.
//  - Local mode (fallback): the API is unreachable (e.g. backend not published
//    yet, or offline) → accounts stay in this browser's localStorage exactly
//    as before.
import type { StoredUser } from './userStore';
import { z } from 'zod';

// VITE_API_URL is baked in at build time (GitHub Actions sets it to the
// published backend URL). In the Replit dev environment the API is served
// on the same origin under /api.
const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';


export const SchoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  website: z.string().nullable().optional(),
  priceCalculator: z.string().nullable().optional(),
  studentSize: z.number().nullable().optional(),
  ownership: z.union([z.string(), z.number()]).nullable(),
  predominantDegree: z.union([z.string(), z.number()]).nullable(),
  highestDegree: z.union([z.string(), z.number()]).nullable(),
  onlineOnly: z.boolean(),
  degreeFields: z.array(z.string()),
  matchedCip: z.string().nullable().optional(),
  programs: z.array(z.object({
    cip4: z.string(),
    cip6: z.string().nullable(),
    title: z.string().nullable(),
    credentialLevel: z.union([z.string(), z.number()]).nullable(),
  })).optional(),
});
export type School = z.infer<typeof SchoolSchema>;

export const SchoolSourceSchema = z.object({
  name: z.string(),
  url: z.string(),
  retrievedAt: z.string(),
});
export type SchoolSource = z.infer<typeof SchoolSourceSchema>;

export const SchoolSearchResultSchema = z.object({
  schools: z.array(SchoolSchema),
  source: SchoolSourceSchema,
});
export type SchoolSearchResult = z.infer<typeof SchoolSearchResultSchema>;

export interface Opportunity {
  id: string;
  kind: 'job' | 'school';
  title: string;
  organization: string;
  location?: string;
  url?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceRetrievedAt?: string;
  status: 'saved' | 'researching' | 'applying' | 'applied' | 'accepted' | 'rejected' | 'closed';
  deadline: string | null;
  notes?: string;
  nextAction?: string;
  readinessChecks: string[];
  createdAt: string;
  updatedAt: string;
}

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

async function apiFetch(path: string, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

/**
 * Admin reads are often the first requests after an autoscale deployment has
 * gone idle. Give the server time to wake and retry one infrastructure failure
 * before telling the dashboard that the central database is unavailable.
 */
async function apiAdminRead(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await apiFetch(path, init, 10_000);
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return apiFetch(path, init, 10_000);
  }
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

export type AdminKeyCheck = 'ok' | 'rejected' | 'not_configured';

/**
 * Verify an admin key against the server (server-side comparison with the
 * ADMIN_API_KEY secret). Throws ApiUnavailableError when the backend is
 * unreachable so callers can decide how to degrade.
 */
export async function apiVerifyAdminKey(key: string): Promise<AdminKeyCheck> {
  const res = await apiAdminRead('/users', { headers: { 'x-admin-key': key } });
  if (res.ok) return 'ok';
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 || data.error === 'admin_key_not_configured') return 'not_configured';
  return 'rejected';
}

/** Save the signed-in user's evaluation details (school, country, intention…). */
export async function apiSaveProfile(username: string, profile: EvalProfile): Promise<void> {
  const token = getUserToken(username);
  if (!token) return; // not authenticated with the backend yet — local-only
  try {
    await apiFetch('/auth/profile', {
      method: 'POST',
      body: JSON.stringify({ username, profile }),
      headers: { 'x-auth-token': token },
    });
  } catch { /* best-effort */ }
}

/**
 * Save the signed-in user's contacted-agency checkmarks.
 *
 * The server performs a union merge (not a full replace) so concurrent saves
 * from two devices can't silently wipe each other's checkmarks. Explicit
 * `removals` (agencies the user deliberately un-checked on this device) are
 * sent separately so the server can apply them after the union.
 *
 * Best-effort: errors are swallowed, localStorage remains the source of truth.
 */
export async function apiSaveContacted(
  username: string,
  contacted: Record<string, string>,
  removals: string[] = [],
): Promise<void> {
  const token = getUserToken(username);
  if (!token) return; // not authenticated with the backend yet — local-only
  try {
    await apiFetch('/auth/contacted', {
      method: 'POST',
      body: JSON.stringify({ username, contacted, removals }),
      headers: { 'x-auth-token': token },
    });
  } catch { /* best-effort */ }
}
export async function apiListUsers(): Promise<ServerUser[]> {
  const res = await apiAdminRead('/users', { headers: adminHeaders() });
  throwIfAdminRejected(res);
  if (!res.ok) throw new ApiUnavailableError();
  const data = await res.json();
  return data.users as ServerUser[];
}

/** Upload accounts that exist only in this browser so they appear on the central admin board. */
export async function apiImportUsers(users: Array<StoredUser & Partial<EvalProfile>>): Promise<number> {
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


export async function apiSearchSchools(cip: string, state: string, degree: string, online: string, page: number = 0): Promise<SchoolSearchResult> {
  const params: Record<string, string> = { cip, page: String(page) };
  if (state && state !== 'all') params.state = state;
  if (degree && degree !== 'all') params.degree = degree;
  if (online && online !== 'all') params.online = online;
  
  const q = new URLSearchParams(params);
  const res = await apiFetch(`/schools/search?${q.toString()}`);
  if (!res.ok) {
    if (res.status === 503) {
      const errData = await res.json().catch(() => ({}));
      if (errData.error === 'college_scorecard_api_key_not_configured') {
        throw new Error('setup_unavailable');
      }
      throw new Error('source_unavailable');
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'School search failed');
  }
  const data = await res.json();
  const parsed = SchoolSearchResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Malformed school search response');
  }
  return parsed.data;
}

export async function apiFetchOpportunities(username: string): Promise<Opportunity[] | null> {
  const token = getUserToken(username);
  if (!token) return null;
  try {
    const res = await apiFetch(`/auth/opportunities?username=${encodeURIComponent(username)}`, { headers: { 'x-auth-token': token } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.opportunities) ? data.opportunities : null;
  } catch {
    return null;
  }
}

export async function apiSaveOpportunities(username: string, opportunities: Opportunity[]): Promise<void> {
  const token = getUserToken(username);
  if (!token) throw new Error('Not authenticated');
  const res = await apiFetch('/auth/opportunities', {
    method: 'PUT',
    body: JSON.stringify({ username, opportunities }),
    headers: { 'x-auth-token': token },
  });
  if (!res.ok) {
    if (res.status === 503) throw new Error('DOE source unavailable (503)');
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save opportunities');
  }
}

export function getUserToken(username: string): string {
  try { return localStorage.getItem(AUTH_TOKEN_PREFIX + username.trim().toLowerCase()) || ''; } catch { return ''; }
}

function saveUserToken(username: string, token: unknown): void {
  if (typeof token !== 'string' || !token) return;
  try { localStorage.setItem(AUTH_TOKEN_PREFIX + username.trim().toLowerCase(), token); } catch { /* storage unavailable */ }
}

export const SchoolContactRecipientSchema = z.object({
  email: z.string(),
  sourceUrl: z.string().optional(),
});
export type SchoolContactRecipient = z.infer<typeof SchoolContactRecipientSchema>;

export const SchoolContactSchema = z.object({
  schoolId: z.string(),
  schoolName: z.string().nullable(),
  status: z.enum(['verified', 'fallback', 'unavailable']),
  recipients: z.array(SchoolContactRecipientSchema).optional().default([]),
  fallbackUrl: z.string().nullable().optional(),
  error: z.string().optional(),
});
export type SchoolContact = z.infer<typeof SchoolContactSchema>;

export async function apiFetchSchoolContacts(username: string, schoolIds: string[]): Promise<SchoolContact[]> {
  const token = getUserToken(username);
  if (!token) throw new Error('Not authenticated');
  const res = await apiFetch('/auth/schools/contacts', {
    method: 'POST',
    body: JSON.stringify({ username, schoolIds }),
    headers: { 'x-auth-token': token },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (res.status === 503 && errData.error === 'college_scorecard_api_key_not_configured') {
      throw new Error('setup_unavailable');
    }
    if (res.status === 503) throw new Error('source_unavailable');
    throw new Error(errData.error || 'Failed to fetch school contacts');
  }
  const data = await res.json();
  const parsed = z.array(SchoolContactSchema).safeParse(data.contacts || []);
  if (!parsed.success) {
    throw new Error('Malformed school contacts response');
  }
  return parsed.data;
}

export const OutreachResultSchema = z.object({
  schoolId: z.string(),
  result: z.enum(['sent', 'failed']),
  providerMessageId: z.string().nullable().optional(),
});
export type OutreachResult = z.infer<typeof OutreachResultSchema>;

export async function apiSendSchoolOutreach(
  username: string, 
  requestId: string,
  schools: { schoolId: string; email: string }[], 
  consent: boolean
): Promise<OutreachResult[]> {
  const token = getUserToken(username);
  if (!token) throw new Error('Not authenticated');
  const res = await apiFetch('/auth/school-outreach', {
    method: 'POST',
    body: JSON.stringify({ username, requestId, schools, consent }),
    headers: { 'x-auth-token': token },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (res.status === 503 && errData.error === 'college_scorecard_api_key_not_configured') {
      throw new Error('setup_unavailable');
    }
    if (res.status === 503) throw new Error('source_unavailable');
    throw new Error(errData.error || 'Failed to send outreach');
  }
  const data = await res.json();
  const parsed = z.array(OutreachResultSchema).safeParse(data.results || []);
  if (!parsed.success) {
    throw new Error('Malformed school outreach response');
  }
  return parsed.data;
}

export interface OutreachHistoryItem {
  packageVersion?: string;
  schoolId: string;
  schoolName: string;
  recipient?: string;
  recipientSourceUrl?: string;
  result: 'sent' | 'failed';
  providerMessageId?: string | null;
  sentAt: string;
}

export async function apiFetchSchoolOutreachHistory(username: string): Promise<OutreachHistoryItem[]> {
  const token = getUserToken(username);
  if (!token) return [];
  const res = await apiFetch(`/auth/school-outreach-history?username=${encodeURIComponent(username)}`, {
    headers: { 'x-auth-token': token },
  });
  if (!res.ok) {
    if (res.status === 503) throw new Error('DOE source unavailable (503)');
    return [];
  }
  const data = await res.json();
  return data.history || [];
}

export async function apiUpsertSchoolOpportunity(username: string, opportunity: Opportunity): Promise<void> {
  const token = getUserToken(username);
  if (!token) throw new Error('Not authenticated');
  const res = await apiFetch(`/auth/opportunities/${encodeURIComponent(opportunity.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ username, opportunity }),
    headers: { 'x-auth-token': token },
  });
  if (!res.ok) {
    if (res.status === 503) throw new Error('source_unavailable');
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save school opportunity');
  }
}

export async function apiDeleteSchoolOpportunity(username: string, id: string): Promise<void> {
  const token = getUserToken(username);
  if (!token) throw new Error('Not authenticated');
  const res = await apiFetch(`/auth/opportunities/${encodeURIComponent(id)}?username=${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: { 'x-auth-token': token },
  });
  if (!res.ok) {
    if (res.status === 503) throw new Error('source_unavailable');
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to delete school opportunity');
  }
}
