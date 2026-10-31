import type { ProgramField, ProgramLevel, ProgramRecord } from './catalog';
import { FIELDS } from './catalog';

export type LevelChoice = ProgramLevel | 'unknown';

export const LEVEL_CHOICES: LevelChoice[] = ['certificate', 'associate', 'bachelor', 'master', 'unknown'];

export const LEVEL_LABELS: Record<LevelChoice, { en: string; es: string }> = {
  certificate: { en: 'Certificate', es: 'Certificado' },
  associate: { en: 'Associate degree', es: 'Título asociado (associate)' },
  bachelor: { en: "Bachelor's degree", es: 'Licenciatura / grado (bachelor)' },
  master: { en: "Master's degree", es: 'Maestría (master)' },
  unknown: { en: 'Not sure / other (doctorate, professional, unresolved)', es: 'No estoy seguro / otro (doctorado, profesional, sin resolver)' },
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Suggests a field only when the user's text exactly equals a recognized
 * English or Spanish field name from FIELDS. Anything else returns null so the
 * user must choose — we never guess from partial or fuzzy text.
 */
export function suggestField(fieldText: string | undefined | null): ProgramField | null {
  if (!fieldText) return null;
  const n = normalize(fieldText);
  if (!n) return null;
  for (const [key, label] of Object.entries(FIELDS) as [ProgramField, { en: string; es: string }][]) {
    if (key === 'other') continue;
    if (normalize(label.en) === n || normalize(label.es) === n) return key;
  }
  return null;
}

export function isMatchableLevel(level: LevelChoice | '' | null | undefined): level is ProgramLevel {
  return level === 'certificate' || level === 'associate' || level === 'bachelor' || level === 'master';
}

export interface MatchQuery {
  level: LevelChoice | '';
  field: ProgramField | '';
  location?: string;
}

/** Strict same-level, same-field filter. Never returns another level. */
export function matchPrograms(programs: readonly ProgramRecord[], q: MatchQuery): ProgramRecord[] {
  if (!isMatchableLevel(q.level) || !q.field || q.field === 'other') return [];
  const loc = q.location && q.location !== 'all' ? q.location : '';
  return programs
    .filter((p) => p.level === q.level && p.field === q.field && (!loc || p.location === loc))
    .slice()
    .sort((a, b) => a.institution.localeCompare(b.institution));
}

export function catalogLocations(programs: readonly ProgramRecord[]): string[] {
  return Array.from(new Set(programs.map((p) => p.location))).sort((a, b) => a.localeCompare(b));
}

export function profileKey(p: { degree?: string; field?: string; country?: string; institution?: string; purpose?: string }): string {
  return JSON.stringify([p.degree ?? '', p.field ?? '', p.country ?? '', p.institution ?? '', p.purpose ?? '']);
}

export function formatCheckedAt(iso: string, es: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(es ? 'es-ES' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
