import type { InstitutionCandidate, InstitutionVerification } from './api';

// ROR is a public, non-government research-organization directory. Its API
// explicitly permits cross-origin reads, so static hosting needs no secret or
// proxy. This corroborates identity, not accreditation, degree authenticity,
// current admissions, or live website availability.
const ROR_API = 'https://api.ror.org/v2/organizations';
type DirectoryRecord = {
  id?: string;
  names?: { value?: string; types?: string[] }[];
  types?: string[];
  status?: string;
  links?: { type?: string; value?: string }[];
  locations?: { geonames_details?: { country_name?: string; country_code?: string; name?: string } }[];
};

export function normalizeInstitutionName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function editDistance(a: string, b: string): number {
  const table = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i]![j] = Math.min(table[i - 1]![j]! + 1, table[i]![j - 1]! + 1,
        table[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        table[i]![j] = Math.min(table[i]![j]!, table[i - 2]![j - 2]! + 1);
      }
    }
  }
  return table[a.length]![b.length]!;
}

function safeWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.)/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

function countryMatches(input: string, code: string, englishName: string): boolean {
  const names = [code, englishName];
  for (const language of ['en', 'es']) {
    try { names.push(new Intl.DisplayNames([language], { type: 'region' }).of(code) || ''); } catch { /* unknown code */ }
  }
  if (code === 'US') names.push('USA', 'U.S.A.', 'United States of America', 'EEUU', 'Estados Unidos de América');
  if (code === 'GB') names.push('UK', 'U.K.', 'Great Britain');
  return names.some(name => normalizeInstitutionName(name) === normalizeInstitutionName(input));
}

export function directoryCandidate(row: DirectoryRecord, name: string, country: string, retrievedAt: string): InstitutionCandidate | null {
  if (!row.id || !/^https:\/\/ror\.org\/0[a-z0-9]{8}$/.test(row.id) ||
    !row.types?.includes('education') || !['active', 'inactive'].includes(row.status || '')) return null;
  const names = (row.names || []).map(item => item.value || '').filter(Boolean);
  const normalized = normalizeInstitutionName(name);
  if (!names.some(value => {
    const other = normalizeInstitutionName(value);
    return other === normalized || (normalized.length >= 6 &&
      editDistance(normalized, other) <= Math.min(3, Math.floor(Math.max(normalized.length, other.length) * 0.18)));
  })) return null;
  const location = row.locations?.find(item => countryMatches(country,
    item.geonames_details?.country_code || '', item.geonames_details?.country_name || ''))?.geonames_details;
  const firstLocation = row.locations?.[0]?.geonames_details;
  const website = safeWebsite(row.links?.find(link => link.type === 'website')?.value);
  const label = row.names?.find(item => item.types?.includes('ror_display'))?.value || names[0] || name;
  return {
    entityId: row.id, name: label, aliases: names.filter(value => value !== label),
    description: row.status === 'inactive'
      ? 'ROR records this education organization as inactive. This is historical identity evidence; a closure date was not established.'
      : 'Education organization recorded in ROR. The record does not independently establish current operating or accreditation status.',
    country: location?.country_name || firstLocation?.country_name || null,
    countryMatch: Boolean(location), higherEducationType: 'Education organization (ROR)',
    officialWebsite: website, websiteAvailability: 'not_checked', closureDate: null,
    wikipediaUrl: safeWebsite(row.links?.find(link => link.type === 'wikipedia')?.value),
    archiveUrl: null, sources: [{ name: 'Research Organization Registry (ROR)', url: row.id, retrievedAt }],
  };
}

async function search(query: string): Promise<DirectoryRecord[]> {
  const response = await fetch(`${ROR_API}?query=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(6_000),
    // No account token, cookies, or other user profile fields leave the site.
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('directory_unavailable');
  const payload = await response.json() as { items?: DirectoryRecord[] };
  if (!Array.isArray(payload.items)) throw new Error('directory_invalid_response');
  return payload.items.slice(0, 20);
}

export async function verifyWithPublicDirectory(
  name: string, country: string, selectedEntityId?: string,
): Promise<InstitutionVerification> {
  const retrievedAt = new Date().toISOString();
  // Strip search operators supplied by the user; only this function adds
  // bounded fuzzy operators to recover spelling transpositions.
  const query = normalizeInstitutionName(name).slice(0, 160);
  if (query.length < 2 || name.length > 200 || !country.trim()) throw new Error('invalid_institution');
  let candidates = (await search(query)).flatMap(row => {
    const candidate = directoryCandidate(row, name, country, retrievedAt);
    return candidate ? [candidate] : [];
  });
  if (!candidates.some(candidate => candidate.countryMatch)) {
    const fuzzy = query.split(/\s+/).map(word => word.length > 3 ? `${word}~1` : word).join(' AND ');
    try {
      const suggested = (await search(fuzzy)).flatMap(row => {
        const candidate = directoryCandidate(row, name, country, retrievedAt);
        return candidate ? [candidate] : [];
      });
      candidates = [...new Map([...candidates, ...suggested].map(candidate => [candidate.entityId, candidate])).values()];
    } catch {
      // The first query succeeded. A failed optional spelling query cannot
      // turn that into a false verification or an invented institution.
    }
  }
  const eligible = candidates.filter(candidate => candidate.countryMatch && candidate.officialWebsite);
  const exact = eligible.filter(candidate =>
    [candidate.name, ...candidate.aliases].some(value => normalizeInstitutionName(value) === query));
  const selected = selectedEntityId
    ? eligible.find(candidate => candidate.entityId === selectedEntityId) || null
    : exact.length === 1 ? exact[0]! : null;
  return {
    status: selected ? 'verified' : candidates.length ? 'ambiguous' : 'not_found',
    message: selected
      ? 'Name, country, education category, and listed official website corroborated by ROR. Not an accreditation finding.'
      : 'No confirmed institution yet. Choose a matching record or continue with clearly labeled unverified information.',
    accreditationChecked: false, selected, candidates, retrievedAt,
  };
}
