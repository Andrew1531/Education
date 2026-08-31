const fs = require('fs');
let code = fs.readFileSync('artifacts/education/src/api.ts', 'utf8');

const additionalTypes = `
export interface School {
  id: string;
  name: string;
  city: string;
  state: string;
  url?: string;
  priceCalculatorUrl?: string;
}

export interface SchoolSearchResult {
  schools: School[];
  total: number;
  page: number;
}

export interface Opportunity {
  id: string;
  type: 'job' | 'school';
  title: string;
  organization: string;
  location?: string;
  url?: string;
  savedAt: string;
  status: 'saved' | 'applied' | 'interviewing' | 'rejected' | 'accepted';
  deadline?: string;
  notes?: string;
  nextAction?: string;
  readinessChecks?: Record<string, boolean>;
}

`;

code = code.replace("export interface EvalProfile", additionalTypes + "export interface EvalProfile");

const additionalFunctions = `
export async function apiSearchSchools(cip: string, state: string, degree: string, online: string, page: number = 1): Promise<SchoolSearchResult> {
  const q = new URLSearchParams({ cip, state, degree, online, page: String(page) });
  const res = await apiFetch(\`/schools/search?\${q.toString()}\`);
  if (!res.ok) throw new Error('School search failed');
  return res.json();
}

export async function apiFetchOpportunities(username: string): Promise<Opportunity[] | null> {
  const token = getUserToken(username);
  if (!token) return null;
  try {
    const res = await apiFetch(\`/auth/opportunities?username=\${encodeURIComponent(username)}\`, { headers: { 'x-auth-token': token } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.opportunities) ? data.opportunities : null;
  } catch {
    return null;
  }
}

export async function apiSaveOpportunities(username: string, opportunities: Opportunity[]): Promise<void> {
  const token = getUserToken(username);
  if (!token) return;
  try {
    await apiFetch('/auth/opportunities', {
      method: 'PUT',
      body: JSON.stringify({ username, opportunities }),
      headers: { 'x-auth-token': token },
    });
  } catch { /* best-effort */ }
}

`;

code = code.replace("export function getUserToken(username: string): string {", additionalFunctions + "export function getUserToken(username: string): string {");

fs.writeFileSync('artifacts/education/src/api.ts', code);
