import { describe, it, expect } from 'vitest';
import { PROGRAMS, FIELDS } from './catalog';
import type { ProgramRecord } from './catalog';
import { matchPrograms, suggestField, isMatchableLevel, catalogLocations, profileKey } from './programMatching';

const rec = (over: Partial<ProgramRecord>): ProgramRecord => ({
  id: 'x', institution: 'B School', location: 'Texas', field: 'nursing', level: 'bachelor', title: 'BSN',
  url: 'https://example.edu/p', sourceUrl: 'https://example.edu/s', checkedAt: '2025-01-15',
  admissionsNote: { en: 'n', es: 'n' }, ...over,
});

const sample: ProgramRecord[] = [
  rec({ id: '1' }),
  rec({ id: '2', level: 'master' }),
  rec({ id: '3', field: 'business' }),
  rec({ id: '4', location: 'Ohio', institution: 'A School' }),
];

describe('matchPrograms', () => {
  const certificates = [
    rec({ id: 'ug', level: 'certificate', certificateType: 'undergraduate', title: 'Certificado de posgrado' }),
    rec({ id: 'grad', level: 'certificate', certificateType: 'graduate', title: 'Undergraduate Certificate' }),
    rec({ id: 'uncertain', level: 'certificate', certificateType: 'uncertain', title: 'Graduate Certificate' }),
    rec({ id: 'missing', level: 'certificate', title: 'Undergraduate Certificate' }),
    rec({ id: 'other-field', level: 'certificate', certificateType: 'graduate', field: 'business' }),
    rec({ id: 'other-location', level: 'certificate', certificateType: 'graduate', location: 'Ohio' }),
    rec({ id: 'degree', level: 'master' }),
  ];
  it.each(['undergraduate', 'graduate'] as const)('matches only explicit %s certificate metadata, never titles', certificateType => {
    expect(matchPrograms(certificates, { level: 'certificate', certificateType, field: 'nursing', location: 'Texas' })
      .map(p => p.id)).toEqual([certificateType === 'undergraduate' ? 'ug' : 'grad']);
  });
  it.each(['uncertain', '', undefined] as const)('refuses unresolved certificate queries (%s)', certificateType => {
    expect(matchPrograms(certificates, { level: 'certificate', certificateType, field: 'nursing' })).toEqual([]);
  });
  it('does not confuse a graduate certificate with a master degree', () => {
    expect(matchPrograms(certificates, { level: 'master', certificateType: 'graduate', field: 'nursing' })
      .map(p => p.id)).toEqual(['degree']);
  });
  it('preserves the graduate certificate gap in the real catalog', () => {
    expect(matchPrograms(PROGRAMS, { level: 'certificate', certificateType: 'graduate', field: 'business' })).toEqual([]);
  });
  it('returns only same level and same field, sorted alphabetically', () => {
    expect(matchPrograms(sample, { level: 'bachelor', field: 'nursing' }).map((p) => p.id)).toEqual(['4', '1']);
  });
  it('never returns next level', () => {
    expect(matchPrograms(sample, { level: 'associate', field: 'nursing' })).toEqual([]);
  });
  it('filters by location', () => {
    expect(matchPrograms(sample, { level: 'bachelor', field: 'nursing', location: 'Ohio' }).map((p) => p.id)).toEqual(['4']);
  });
  it('refuses unknown level, empty or other field', () => {
    expect(matchPrograms(sample, { level: 'unknown', field: 'nursing' })).toEqual([]);
    expect(matchPrograms(sample, { level: '', field: 'nursing' })).toEqual([]);
    expect(matchPrograms(sample, { level: 'bachelor', field: '' })).toEqual([]);
    expect(matchPrograms(sample, { level: 'bachelor', field: 'other' })).toEqual([]);
  });
});

describe('suggestField', () => {
  it('only suggests exact English or Spanish names', () => {
    const k = (Object.keys(FIELDS) as (keyof typeof FIELDS)[]).find((f) => f !== 'other')!;
    expect(suggestField(FIELDS[k].en)).toBe(k);
    expect(suggestField(FIELDS[k].es.toUpperCase())).toBe(k);
    expect(suggestField(`${FIELDS[k].en} and more`)).toBeNull();
    expect(suggestField('')).toBeNull();
    expect(suggestField(undefined)).toBeNull();
  });
});

describe('misc', () => {
  it('isMatchableLevel excludes unknown', () => {
    expect(isMatchableLevel('master')).toBe(true);
    expect(isMatchableLevel('unknown')).toBe(false);
  });
  it('catalogLocations dedupes', () => {
    expect(catalogLocations(sample)).toEqual(['Ohio', 'Texas']);
  });
  it('profileKey changes with degree', () => {
    expect(profileKey({ degree: 'a' })).not.toBe(profileKey({ degree: 'b' }));
  });
  it('real catalog only uses supported levels', () => {
    for (const p of PROGRAMS) expect(['certificate', 'associate', 'bachelor', 'master']).toContain(p.level);
  });
});
