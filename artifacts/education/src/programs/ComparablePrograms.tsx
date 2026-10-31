import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileSearch, GraduationCap, Info, MapPin, Search, ShieldAlert, BookOpenCheck } from 'lucide-react';
import { PROGRAMS, FIELDS } from './catalog';
import type { ProgramField, ProgramRecord } from './catalog';
import {
  LEVEL_CHOICES,
  LEVEL_LABELS,
  catalogLocations,
  formatCheckedAt,
  isMatchableLevel,
  matchPrograms,
  profileKey,
  suggestField,
  type LevelChoice,
} from './programMatching';

export interface ComparableProfile {
  degree?: string;
  field?: string;
  country?: string;
  institution?: string;
  purpose?: string;
}

interface Props {
  profile: ComparableProfile;
  es: boolean;
}

const selectCls =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50';

export function ComparablePrograms({ profile, es }: Props) {
  const L = (en: string, sp: string) => (es ? sp : en);
  const key = profileKey(profile);
  const suggested = useMemo(() => suggestField(profile.field), [profile.field]);

  const [level, setLevel] = useState<LevelChoice | ''>('');
  const [field, setField] = useState<ProgramField | ''>(suggested ?? '');
  const [location, setLocation] = useState('all');
  const [results, setResults] = useState<ProgramRecord[] | null>(null);
  const [searchedFor, setSearchedFor] = useState('');

  // New profile → reset everything so no stale matches survive.
  useEffect(() => {
    setLevel('');
    setField(suggested ?? '');
    setLocation('all');
    setResults(null);
    setSearchedFor('');
  }, [key, suggested]);

  const locations = useMemo(() => catalogLocations(PROGRAMS), []);
  const fieldKeys = Object.keys(FIELDS) as ProgramField[];
  const canSearch = isMatchableLevel(level) && !!field && field !== 'other';

  const clearResults = () => { setResults(null); setSearchedFor(''); };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    setResults(matchPrograms(PROGRAMS, { level, field, location }));
    setSearchedFor(JSON.stringify([key, level, field, location]));
  };

  const fresh = results !== null && searchedFor === JSON.stringify([key, level, field, location]);
  const fieldLabel = field ? FIELDS[field][es ? 'es' : 'en'] : '';
  const levelLabel = level ? LEVEL_LABELS[level][es ? 'es' : 'en'] : '';

  return (
    <section
      className="mt-12 glass-panel rounded-2xl p-6 sm:p-8 space-y-7 border-t border-t-white/10"
      data-testid="container-comparable-programs"
      aria-labelledby="cp-title"
    >
      <header className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-300">
          {L('Sourced directory · limited', 'Directorio con fuentes · limitado')}
        </p>
        <h3 id="cp-title" className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {L('Comparable U.S. programs at your level', 'Programas de EE. UU. comparables a su nivel')}
        </h3>
        <p className="text-slate-300 leading-relaxed max-w-3xl text-sm">
          {L(
            'Find U.S. programs at the same level you already earned, in the same field — not the next level up. This is a small, hand-checked list with official links, not every U.S. institution and not a ranking.',
            'Encuentre programas en EE. UU. del mismo nivel que ya obtuvo, en el mismo campo — no el nivel siguiente. Es una lista pequeña revisada a mano con enlaces oficiales, no todas las instituciones de EE. UU. ni una clasificación.',
          )}
        </p>
        <div className="flex gap-3 rounded-xl border border-indigo-500/25 bg-indigo-950/30 p-4 text-sm text-indigo-100" data-testid="text-cp-explainer">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-300" aria-hidden />
          <p className="leading-relaxed">
            {L(
              'A match here does not mean you must re-earn your degree. It shows where a comparable program exists, so you can ask that school directly how it reviews international credentials. Only the school decides admission, transfer credit or placement.',
              'Una coincidencia aquí no significa que deba volver a obtener su título. Muestra dónde existe un programa comparable para que pueda preguntar directamente a esa institución cómo revisa credenciales internacionales. Solo la institución decide admisión, créditos o ubicación.',
            )}
          </p>
        </div>
      </header>

      <form onSubmit={onSearch} className="space-y-5" data-testid="form-comparable-programs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-2">
            <label htmlFor="cp-level" className="text-sm font-semibold text-slate-200">
              {L('1. Confirm your earned level', '1. Confirme su nivel obtenido')}
            </label>
            {profile.degree && (
              <p className="text-xs text-slate-400" data-testid="text-cp-entered-degree">
                {L('You entered:', 'Usted indicó:')} <span className="text-slate-200">{profile.degree}</span>
              </p>
            )}
            <select
              id="cp-level"
              className={selectCls}
              value={level}
              onChange={(e) => { setLevel(e.target.value as LevelChoice | ''); clearResults(); }}
              data-testid="select-cp-level"
            >
              <option value="">{L('Choose a level…', 'Elija un nivel…')}</option>
              {LEVEL_CHOICES.map((l) => (
                <option key={l} value={l}>{LEVEL_LABELS[l][es ? 'es' : 'en']}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="cp-field" className="text-sm font-semibold text-slate-200">
              {L('2. Review your field', '2. Revise su campo')}
            </label>
            <p className="text-xs text-slate-400" data-testid="text-cp-field-hint">
              {suggested
                ? L('Pre-selected from your exact field name. Change it if needed.', 'Preseleccionado por el nombre exacto de su campo. Cámbielo si es necesario.')
                : L('No exact match to your entry — please choose.', 'Sin coincidencia exacta con lo que indicó — elija uno.')}
            </p>
            <select
              id="cp-field"
              className={selectCls}
              value={field}
              onChange={(e) => { setField(e.target.value as ProgramField | ''); clearResults(); }}
              data-testid="select-cp-field"
            >
              <option value="">{L('Choose a field…', 'Elija un campo…')}</option>
              {fieldKeys.map((f) => (
                <option key={f} value={f}>{FIELDS[f][es ? 'es' : 'en']}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="cp-location" className="text-sm font-semibold text-slate-200">
              {L('3. Location (optional)', '3. Ubicación (opcional)')}
            </label>
            <p className="text-xs text-slate-400">{L('Only places in this directory.', 'Solo lugares de este directorio.')}</p>
            <select
              id="cp-location"
              className={selectCls}
              value={location}
              onChange={(e) => { setLocation(e.target.value); clearResults(); }}
              data-testid="select-cp-location"
            >
              <option value="all">{L('All listed locations', 'Todas las ubicaciones listadas')}</option>
              {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
        </div>

        <p className="flex gap-2 text-xs text-amber-200/90" data-testid="text-cp-level-warning">
          <ShieldAlert className="h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden />
          {L(
            'Your level choice is a self-reported comparison category, not an official U.S. equivalency. Only a credential evaluation service or the school can determine that.',
            'Su elección de nivel es una categoría de comparación autodeclarada, no una equivalencia oficial de EE. UU. Solo un servicio de evaluación de credenciales o la institución puede determinarla.',
          )}
        </p>

        {level === 'unknown' && (
          <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-950/25 p-4 text-sm text-amber-100" data-testid="text-cp-unknown-level">
            {L(
              'We only list certificate through master programs, and we will not guess a level for doctorate, professional or unclear titles. A credential evaluation can tell you how your title is classified in the U.S.',
              'Solo listamos programas de certificado a maestría, y no adivinamos el nivel de doctorados, títulos profesionales o títulos poco claros. Una evaluación de credenciales puede indicarle cómo se clasifica su título en EE. UU.',
            )}
          </div>
        )}
        {field === 'other' && (
          <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-950/25 p-4 text-sm text-amber-100" data-testid="text-cp-other-field">
            {L('This directory has no programs for "Other" fields yet.', 'Este directorio aún no tiene programas para campos de "Otro".')}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSearch}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="button-cp-search"
        >
          <Search className="h-4 w-4" aria-hidden />
          {L('Show comparable programs', 'Mostrar programas comparables')}
        </button>
      </form>

      <div aria-live="polite">
        {fresh && results!.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center" data-testid="text-cp-empty">
            <FileSearch className="mx-auto mb-3 h-9 w-9 text-slate-500" aria-hidden />
            <p className="font-semibold text-slate-200">
              {L('No listed programs match yet.', 'Aún no hay programas listados que coincidan.')}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              {L(
                `This directory has no ${levelLabel.toLowerCase()} programs in ${fieldLabel}${location !== 'all' ? ` in ${location}` : ''}. That reflects our limited list — not whether such programs exist. Try all locations, or check schools' official sites.`,
                `Este directorio no tiene programas de ${levelLabel.toLowerCase()} en ${fieldLabel}${location !== 'all' ? ` en ${location}` : ''}. Esto refleja nuestra lista limitada, no si existen tales programas. Pruebe todas las ubicaciones o consulte los sitios oficiales de las instituciones.`,
              )}
            </p>
          </div>
        )}

        {fresh && results!.length > 0 && (
          <div className="space-y-4" data-testid="list-cp-results">
            <p className="text-sm text-slate-400" data-testid="text-cp-count">
              {L(
                `${results!.length} listed ${results!.length === 1 ? 'program' : 'programs'} · alphabetical, not ranked`,
                `${results!.length} ${results!.length === 1 ? 'programa listado' : 'programas listados'} · orden alfabético, sin clasificación`,
              )}
            </p>
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {results!.map((p) => (
                <li key={p.id} className="flex flex-col rounded-xl border border-slate-700/70 bg-slate-800/40 p-5 transition-colors hover:border-indigo-500/40" data-testid={`card-cp-program-${p.id}`}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{p.institution}</p>
                  <h4 className="mt-1 text-base font-bold leading-snug text-white">{p.title}</h4>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> {p.location}
                  </p>
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-950/40 px-3 py-2 text-xs text-indigo-100" data-testid={`text-cp-reason-${p.id}`}>
                    <GraduationCap className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                    {L(
                      `Same level (${LEVEL_LABELS[p.level].en}) and same field (${FIELDS[p.field].en}) as you selected.`,
                      `Mismo nivel (${LEVEL_LABELS[p.level].es}) y mismo campo (${FIELDS[p.field].es}) que seleccionó.`,
                    )}
                  </p>
                  <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-slate-300" data-testid={`text-cp-note-${p.id}`}>
                    <BookOpenCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden />
                    {p.admissionsNote[es ? 'es' : 'en']}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-sm">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-300 underline-offset-4 hover:underline" data-testid={`link-cp-program-${p.id}`}>
                      {L('Official program page', 'Página oficial del programa')} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">{L('(opens in new tab)', '(se abre en otra pestaña)')}</span>
                    </a>
                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline" data-testid={`link-cp-source-${p.id}`}>
                      {L('Source', 'Fuente')} <ExternalLink className="h-3 w-3" aria-hidden />
                      <span className="sr-only">{L('(opens in new tab)', '(se abre en otra pestaña)')}</span>
                    </a>
                    <span className="text-xs text-slate-500" data-testid={`text-cp-checked-${p.id}`}>
                      {L('Reviewed', 'Revisado')} {formatCheckedAt(p.checkedAt, es)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              {L(
                'Details can change. Confirm requirements on the official page before applying. VerifED Global makes no claim about admission, credit transfer or licensing.',
                'Los detalles pueden cambiar. Confirme los requisitos en la página oficial antes de postularse. VerifED Global no garantiza admisión, transferencia de créditos ni licencias.',
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
