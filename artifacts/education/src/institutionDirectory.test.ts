import { afterEach, describe, expect, it, vi } from 'vitest';
import { directoryCandidate, normalizeInstitutionName, verifyWithPublicDirectory } from './institutionDirectory';
import { apiVerifyInstitution } from './api';

const record = {
  id: 'https://ror.org/005ywsr52',
  names: [{ value: 'Friends University', types: ['ror_display', 'label'] }],
  types: ['education'], status: 'active',
  links: [{ type: 'website', value: 'https://www.friends.edu/' }],
  locations: [{ geonames_details: { country_code: 'US', country_name: 'United States', name: 'Wichita' } }],
};
const at = '2026-10-31T12:00:00.000Z';
const json = (items: unknown[]) => new Response(JSON.stringify({ items }), {
  status: 200, headers: { 'content-type': 'application/json' },
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('public institution evidence', () => {
  it('preserves non-Latin institution names', () => {
    expect(normalizeInstitutionName('北京大学')).toBe('北京大学');
    expect(normalizeInstitutionName('Universidad de Guayaquil')).toBe('universidad de guayaquil');
  });
  it('corroborates an education organization with country and official site evidence', () => {
    const candidate = directoryCandidate(record, 'friends university', 'United States', at)!;
    expect(candidate.countryMatch).toBe(true);
    expect(candidate.officialWebsite).toBe('https://www.friends.edu/');
    expect(candidate.sources[0]?.url).toBe(record.id);
    expect(candidate.websiteAvailability).toBe('not_checked');
  });
  it('accepts a Spanish country name but does not ignore country mismatches', () => {
    expect(directoryCandidate(record, 'Friends University', 'Estados Unidos', at)?.countryMatch).toBe(true);
    expect(directoryCandidate(record, 'Friends University', 'Ecuador', at)?.countryMatch).toBe(false);
  });
  it('rejects funders, unrelated names, withdrawn records, and forged source IDs', () => {
    expect(directoryCandidate({ ...record, types: ['funder'] }, 'Friends University', 'United States', at)).toBeNull();
    expect(directoryCandidate(record, 'Other College', 'United States', at)).toBeNull();
    expect(directoryCandidate({ ...record, status: 'withdrawn' }, 'Friends University', 'United States', at)).toBeNull();
    expect(directoryCandidate({ ...record, id: 'https://attacker.example/005ywsr52' }, 'Friends University', 'United States', at)).toBeNull();
  });
  it('does not trust an unsafe listed website', () => {
    expect(directoryCandidate({ ...record, links: [{ type: 'website', value: 'javascript:alert(1)' }] },
      'Friends University', 'United States', at)?.officialWebsite).toBeNull();
  });
  it('does not invent a closure date for inactive records', () => {
    const candidate = directoryCandidate({ ...record, status: 'inactive' }, 'Friends University', 'United States', at);
    expect(candidate?.closureDate).toBeNull();
    expect(candidate?.description).toContain('inactive');
  });
  it('confirms exact names without a backend or API key', async () => {
    const fetcher = vi.fn().mockResolvedValue(json([record]));
    vi.stubGlobal('fetch', fetcher);
    const result = await apiVerifyInstitution('friends university', 'United States');
    expect(result.status).toBe('verified');
    expect(result.accreditationChecked).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toMatch(/^https:\/\/api\.ror\.org\//);
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe('omit');
  });
  it('requires explicit confirmation for a spelling suggestion', async () => {
    const barclay = { ...record, id: 'https://ror.org/040wesb37',
      names: [{ value: 'Barclay College', types: ['ror_display'] }],
      links: [{ type: 'website', value: 'https://www.barclaycollege.edu/' }] };
    const fetcher = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json([barclay]));
    vi.stubGlobal('fetch', fetcher);
    const result = await verifyWithPublicDirectory('Barcaly College', 'United States');
    expect(result.status).toBe('ambiguous');
    expect(result.selected).toBeNull();
    expect(result.candidates[0]?.name).toBe('Barclay College');
    expect(decodeURIComponent(fetcher.mock.calls[1]?.[0])).toContain('barcaly~1 AND college~1');
  });
  it('does not verify a different-country record even after selection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json([record]))));
    const result = await verifyWithPublicDirectory('Friends University', 'Ecuador', record.id);
    expect(result.status).toBe('ambiguous');
    expect(result.selected).toBeNull();
  });
  it('keeps duplicate exact records ambiguous', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([record, { ...record, id: 'https://ror.org/040wesb37' }])));
    expect((await verifyWithPublicDirectory('Friends University', 'United States')).status).toBe('ambiguous');
  });
  it('can confirm a freshly re-resolved eligible selection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([record])));
    const result = await verifyWithPublicDirectory('Friends University', 'United States', record.id);
    expect(result.selected?.entityId).toBe(record.id);
  });
  it('reports directory absence honestly when the static host has no backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.startsWith('https://api.ror.org') ? json([]) : new Response('<html>404</html>', { status: 404 }))));
    const result = await apiVerifyInstitution('Unlisted College', 'United States');
    expect(result.status).toBe('not_found');
    expect(result.selected).toBeNull();
  });
  it('fails explicitly if every evidence provider is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')));
    await expect(apiVerifyInstitution('Friends University', 'United States')).rejects.toThrow('API unavailable');
  });
});
