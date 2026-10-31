import { describe, expect, it } from 'vitest';
import { buildDossierHtml, guidanceFor, normalizeQualifications, type Qualification } from './qualificationGuidance';
const q: Qualification = { id: 'q1', awardName: 'Doctor en Medicina', institution: 'Universidad', country: 'Ecuador', field: 'Medicina', duration: '6 años', completion: 'completed', awardType: 'professional', evidenceStatus: 'unavailable' };
describe('Evidence-limited U.S. guidance and dossiers', () => {
  it('migrates a single legacy award without guessing its type or completion', () => {
    expect(normalizeQualifications({ degree: 'B.Sc', country: 'India', institution: 'College', credits: '3 years' })[0]).toMatchObject({ awardName: 'B.Sc', duration: '3 years', awardType: 'unknown', completion: 'unknown', evidenceStatus: 'not_checked' });
    expect(normalizeQualifications({ degree: 'B.Sc', qualifications: [] })).toEqual([]);
  });
  it.each(['MBBS', 'Doctor', 'PhD', 'Licenciatura', 'N/A', 'Unknown certificate'])('never assigns %s to an automatic U.S. level', awardName => {
    const guidance = guidanceFor({ ...q, awardName }, 'en');
    expect(guidance.limits).toContain('not a U.S. equivalency');
    expect(guidance.context).toContain(awardName);
    expect(guidance.career).toContain('official evaluation accepted by that recipient');
    expect(guidance).not.toHaveProperty('level');
  });
  it('requests missing details and distinguishes incomplete education', () => {
    const g = guidanceFor({ ...q, country: '', field: '', duration: '', completion: 'in_progress' }, 'en');
    expect(g.missing).toEqual(['Country of education', 'Field of study', 'Study duration / original credits']);
    expect(g.context).toContain('do not present it as an earned degree');
    expect(g.licensing).toContain('exact profession and U.S. state');
  });
  it.each(['en', 'es'] as const)('exports all entries, raw details, evidence boundaries and escaped content in %s', lang => {
    const html = buildDossierHtml([q, { ...q, id: 'q2', awardName: '<script>alert(1)</script>', completion: 'unknown', evidenceStatus: 'not_found' }], lang, 'Employment & HR');
    expect(html).toContain('Doctor en Medicina');
    expect(html).toContain('6 años');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/undefined|120–130|U.S. SCU/);
    expect(html).toContain('nces.ed.gov');
    expect(html).toContain('recognition-of-foreign-qualifications');
    expect(html).toContain(lang === 'es' ? 'Fuentes no disponibles' : 'Sources unavailable');
    expect(html).toContain(lang === 'es' ? 'No encontrada en las fuentes consultadas' : 'Not found in consulted sources');
  });
});
