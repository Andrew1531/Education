import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileSearch, GraduationCap, Info, MapPin, Search, ShieldAlert, BookOpenCheck } from 'lucide-react';
import { PROGRAMS, FIELDS } from './catalog';
import type { CertificateType, ProgramField, ProgramRecord } from './catalog';
import { useSavedPrograms, programOpportunity } from './useSavedPrograms';
import { ProgramOutreach } from './ProgramOutreach';
import {
  LEVEL_CHOICES,
  LEVEL_LABELS,
  CERTIFICATE_TYPE_LABELS,
  catalogLocations,
  formatCheckedAt,
  isMatchableLevel,
  isKnownCertificateType,
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
  username?: string | null;
  profile: ComparableProfile;
  es: boolean;
}

const selectCls =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50';

export function ComparablePrograms({ profile, es, username }: Props) {
  const L = (en: string, sp: string) => (es ? sp : en);
  const key = profileKey(profile);
  const suggested = useMemo(() => suggestField(profile.field), [profile.field]);
  const saved = useSavedPrograms(username);
  const [outreachBusy, setOutreachBusy] = useState(false);

  const [level, setLevel] = useState<LevelChoice | ''>('');
  const [certificateType, setCertificateType] = useState<CertificateType | ''>('');
  const [field, setField] = useState<ProgramField | ''>(suggested ?? '');
  const [location, setLocation] = useState('all');
  const [results, setResults] = useState<ProgramRecord[] | null>(null);
  const [searchedFor, setSearchedFor] = useState('');

  // New profile → reset everything so no stale matches survive.
  useEffect(() => {
    setLevel('');
    setCertificateType('');
    setField(suggested ?? '');
    setLocation('all');
    setResults(null);
    setSearchedFor('');
  }, [key, suggested]);

  const locations = useMemo(() => catalogLocations(PROGRAMS), []);
  const fieldKeys = Object.keys(FIELDS) as ProgramField[];
  const canSearch = isMatchableLevel(level) && !!field && field !== 'other'
    && (level !== 'certificate' || isKnownCertificateType(certificateType));

  const clearResults = () => { setResults(null); setSearchedFor(''); };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    setResults(matchPrograms(PROGRAMS, { level, certificateType, field, location }));
    setSearchedFor(JSON.stringify([key, level, certificateType, field, location]));
  };

  const fresh = results !== null && searchedFor === JSON.stringify([key, level, certificateType, field, location]);
  const fieldLabel = field ? FIELDS[field][es ? 'es' : 'en'] : '';
  const levelLabel = level === 'certificate' && certificateType
    ? CERTIFICATE_TYPE_LABELS[certificateType][es ? 'es' : 'en']
    : level ? LEVEL_LABELS[level][es ? 'es' : 'en'] : '';

  return (
    <section
      className="vf-card !rounded-[32px] p-6 sm:p-10 space-y-8"
      data-testid="container-comparable-programs"
      aria-labelledby="cp-title"
    >
      <header className="space-y-3 -mx-6 -mt-6 sm:-mx-10 sm:-mt-10 rounded-t-[32px] bg-[#EEF0FF] px-6 py-8 sm:px-10 sm:py-10">
        <p className="vf-eyebrow">
          {L('Sourced directory · limited', 'Directorio con fuentes · limitado')}
        </p>
        <h3 id="cp-title" className="text-[28px] sm:text-[36px] font-bold leading-tight text-[#0F172A]">
          {L('Comparable U.S. programs at your level', 'Programas de EE. UU. comparables a su nivel')}
        </h3>
        <p className="text-[#273449] leading-relaxed max-w-3xl text-base">
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
      <div className="text-sm text-slate-300" role="status">
        {!username ? L('Sign in to save programs to your own account.', 'Inicie sesión para guardar programas en su propia cuenta.')
          : saved.mode === 'loading' ? L('Checking saved programs…', 'Consultando los programas guardados…')
          : saved.mode === 'remote' ? L('Saved programs are connected to your account on the backend.', 'Los programas guardados están conectados a su cuenta en el servidor.')
          : L('Browser-only storage for this signed-in account. Cross-device sync and email sending require a configured, reachable backend.', 'Almacenamiento solo en este navegador para esta cuenta. La sincronización entre dispositivos y el envío de correos requieren un servidor configurado y accesible.')}
        {username && saved.mode === 'local' && <button className="ml-3 underline text-indigo-300" disabled={saved.busy} onClick={saved.retry}>{L('Retry connection', 'Reintentar conexión')}</button>}
        {saved.error && <p role="alert" className="text-amber-200">{L('Could not confirm that changes were stored or synced. Existing saved data was not cleared. Check browser storage and retry the connection.', 'No se pudo confirmar el almacenamiento o la sincronización de los cambios. No se borraron los datos existentes. Revise el almacenamiento del navegador y reintente la conexión.')}</p>}
      </div>

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
              onChange={(e) => { setLevel(e.target.value as LevelChoice | ''); setCertificateType(''); clearResults(); }}
              data-testid="select-cp-level"
            >
              <option value="">{L('Choose a level…', 'Elija un nivel…')}</option>
              {LEVEL_CHOICES.map((l) => (
                <option key={l} value={l}>{LEVEL_LABELS[l][es ? 'es' : 'en']}</option>
              ))}
            </select>
            {level === 'certificate' && (
              <div className="space-y-2">
                <label htmlFor="cp-certificate-type" className="text-sm font-semibold text-slate-200">
                  {L('Certificate type', 'Tipo de certificado')}
                </label>
                <select
                  id="cp-certificate-type"
                  className={selectCls}
                  value={certificateType}
                  onChange={(e) => { setCertificateType(e.target.value as CertificateType | ''); clearResults(); }}
                  data-testid="select-cp-certificate-type"
                  aria-describedby="cp-certificate-hint"
                >
                  <option value="">{L('Choose a certificate type…', 'Elija un tipo de certificado…')}</option>
                  {(Object.keys(CERTIFICATE_TYPE_LABELS) as CertificateType[]).map(type => (
                    <option key={type} value={type}>{CERTIFICATE_TYPE_LABELS[type][es ? 'es' : 'en']}</option>
                  ))}
                </select>
                <p id="cp-certificate-hint" className="text-xs text-slate-400">
                  {L(
                    'Use the award’s documented academic level, not a translated title. Graduate certificates are not master’s degrees.',
                    'Use el nivel académico documentado del certificado, no un título traducido. Los certificados de posgrado no son maestrías.',
                  )}
                </p>
              </div>
            )}
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

        {level === 'certificate' && certificateType === 'uncertain' && (
          <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-950/25 p-4 text-sm text-amber-100" data-testid="text-cp-uncertain-certificate">
            {L(
              'We cannot show comparable certificates until the type is known. We will not infer undergraduate or graduate level from a translated title or claim U.S. equivalency. Ask the awarding institution, a credential evaluation service or the receiving school to clarify the academic level.',
              'No podemos mostrar certificados comparables hasta conocer el tipo. No inferimos el nivel de pregrado o posgrado de un título traducido ni afirmamos equivalencia en EE. UU. Consulte el nivel académico con la institución que lo otorgó, un servicio de evaluación de credenciales o la institución receptora.',
            )}
          </div>
        )}
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
                      `Same level (${p.level === 'certificate' && p.certificateType ? CERTIFICATE_TYPE_LABELS[p.certificateType].en : LEVEL_LABELS[p.level].en}) and same field (${FIELDS[p.field].en}) as you selected.`,
                      `Mismo nivel (${p.level === 'certificate' && p.certificateType ? CERTIFICATE_TYPE_LABELS[p.certificateType].es : LEVEL_LABELS[p.level].es}) y mismo campo (${FIELDS[p.field].es}) que seleccionó.`,
                    )}
                  </p>
                  <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-slate-300" data-testid={`text-cp-note-${p.id}`}>
                    <BookOpenCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden />
                    {p.admissionsNote[es ? 'es' : 'en']}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-sm">
                    {username && <button
                      className="rounded-lg border border-indigo-500 px-3 py-2 text-indigo-200 disabled:opacity-40"
                      disabled={saved.busy || saved.mode === 'loading' || outreachBusy}
                      data-testid={`button-save-program-${p.id}`}
                      onClick={() => {
                        const existing = saved.items.find(o => o.kind === 'school' && o.id === p.id);
                        void saved.change(existing ?? programOpportunity(p), !!existing);
                      }}
                    >{saved.items.some(o => o.kind === 'school' && o.id === p.id) ? L('Saved · remove', 'Guardado · eliminar') : L('Save program', 'Guardar programa')}</button>}
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
      {username && <ProgramOutreach key={username} username={username} items={saved.items}
        remote={saved.mode === 'remote'} busy={saved.busy || saved.mode === 'loading'}
        onWorkingChange={setOutreachBusy}
        profileKey={JSON.stringify(profile)} profile={profile} es={es} remove={item => { void saved.change(item, true); }} />}
    </section>
  );
}
