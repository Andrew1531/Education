import { describe, it, expect } from 'vitest';
import { PROGRAMS, type ProgramField, type ProgramLevel } from './catalog';
import { catalogLocations, matchPrograms } from './programMatching';
import { reviewDue } from './catalogReview';

describe('official directory evidence', () => {
  it('has unique ids, real review dates, bilingual caveats and official HTTPS sources', () => {
    expect(new Set(PROGRAMS.map(p => p.id)).size).toBe(PROGRAMS.length);
    const hosts = new Set(['www.umgc.edu', 'catalog.wichita.edu', 'catalog.uaf.edu', 'uafs.edu', 'dentistry.iu.edu']);
    for (const p of PROGRAMS) {
      for (const link of [p.url, p.sourceUrl]) {
        const url = new URL(link);
        expect(url.protocol).toBe('https:');
        expect(hosts.has(url.hostname), p.id).toBe(true);
        expect(url.pathname).not.toBe('/');
      }
      expect(reviewDue(p.checkedAt, new Date(`${p.checkedAt}T00:00:00Z`)), p.id).toBe(false);
      expect(p.admissionsNote.en.length).toBeGreaterThan(80);
      expect(p.admissionsNote.es.length).toBeGreaterThan(80);
    }
  });
});

const coverage: [ProgramLevel, ProgramField, string][] = [
  ['certificate', 'accounting', 'Fairbanks, Alaska'],
  ['certificate', 'business', 'Fairbanks, Alaska'],
  ['associate', 'accounting', 'Fairbanks, Alaska'],
  ['associate', 'business', 'Fairbanks, Alaska'],
  ['associate', 'engineering', 'Fort Smith, Arkansas'],
  ['bachelor', 'engineering', 'Wichita, Kansas'],
  ['master', 'engineering', 'Wichita, Kansas'],
  ['bachelor', 'biology', 'Wichita, Kansas'],
  ['master', 'biology', 'Wichita, Kansas'],
  ['master', 'dentistry', 'Indianapolis, Indiana'],
];

describe('same-level coverage', () => {
  it.each(coverage)('finds %s %s in %s without substituting levels or fields', (level, field, location) => {
    const matches = matchPrograms(PROGRAMS, { level, field, location });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(p => p.level === level && p.field === field && p.location === location)).toBe(true);
    expect(catalogLocations(PROGRAMS)).toContain(location);
  });
  it('preserves honest gaps rather than substituting dental hygiene, specialties or doctorates', () => {
    for (const level of ['certificate', 'associate', 'bachelor', 'unknown'] as const) {
      expect(matchPrograms(PROGRAMS, { level, field: 'dentistry' })).toEqual([]);
    }
    expect(matchPrograms(PROGRAMS, { level: 'associate', field: 'biology' })).toEqual([]);
    expect(matchPrograms(PROGRAMS, { level: 'master', field: 'dentistry', location: 'Maryland' })).toEqual([]);
    expect(PROGRAMS.some(p => /\b(DDS|DMD|PhD|doctorate|specialty certificate)\b/i.test(p.title))).toBe(false);
  });
  it('keeps the dental master distinct from its prerequisites and license', () => {
    const matches = matchPrograms(PROGRAMS, { level: 'master', field: 'dentistry' });
    expect(matches.map(p => p.title)).toEqual(['Master of Science in Dentistry (M.S.D.)']);
    expect(matches[0].admissionsNote.en).toMatch(/DDS\/DMD/);
    expect(matches[0].admissionsNote.en).toMatch(/specialty title alone does not establish a master/);
    expect(matches[0].admissionsNote.en).toMatch(/does not establish eligibility for U.S. dental licensure/);
    expect(matches[0].admissionsNote.es).toMatch(/no determina elegibilidad para una licencia/);
  });
  it('does not present undergraduate certificates as graduate awards', () => {
    for (const p of PROGRAMS.filter(p => p.level === 'certificate')) {
      expect(p.title).toContain('Undergraduate Certificate');
      expect(p.admissionsNote.en).toContain('not a graduate certificate');
      expect(p.admissionsNote.es).toContain('no un certificado de posgrado');
    }
  });
});
