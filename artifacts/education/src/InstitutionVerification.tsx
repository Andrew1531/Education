import React, { useEffect, useRef, useState } from 'react';
import {
  apiVerifyInstitution,
  type InstitutionCandidate,
  type InstitutionVerification as Verification,
} from './api';

function safeHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const privateHost = host === 'localhost' || host.endsWith('.localhost') || host === '::1' ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return ['http:', 'https:'].includes(url.protocol) && !privateHost && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function InstitutionVerification({
  name,
  country,
  lang,
  onChange,
  onContinueUnverified,
}: {
  name: string;
  country: string;
  lang: 'en' | 'es';
  onChange: (verification: Verification | null) => void;
  onContinueUnverified: () => void;
}) {
  const [result, setResult] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const autoTimer = useRef<number | undefined>(undefined);
  const es = lang === 'es';

  useEffect(() => {
    requestId.current += 1;
    setResult(null);
    setError('');
    setLoading(false);
    onChange(null);
    // Check each settled entry, not just visitors who notice the manual button.
    // Changing either input invalidates the evidence immediately.
    autoTimer.current = name.trim().length >= 3 && country.trim().length >= 2
      ? window.setTimeout(() => void check(), 1000) : undefined;
    return () => {
      window.clearTimeout(autoTimer.current);
      requestId.current += 1;
    };
    // onChange is intentionally excluded: callers may provide an inline setter,
    // while only an input identity change should invalidate evidence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, country]);

  async function check(selectedEntityId?: string) {
    window.clearTimeout(autoTimer.current);
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const next = await apiVerifyInstitution(name.trim(), country.trim(), selectedEntityId);
      if (id !== requestId.current) return;
      setResult(next);
      onChange(next.status === 'verified' && next.selected ? next : null);
    } catch (err) {
      if (id !== requestId.current) return;
      const code = err instanceof Error ? err.message : '';
      setError(code === 'rate_limited'
        ? (es ? 'Demasiadas consultas. Espere un minuto e inténtelo de nuevo.' : 'Too many checks. Wait a minute and retry.')
        : (es ? 'Las fuentes públicas no están disponibles ahora. Reintente o continúe con la institución marcada como no verificada.' : 'Public evidence sources are unavailable right now. Retry or continue with the institution clearly marked unverified.'));
      onChange(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const selected = result?.selected;
  return (
    <div className="mt-3 rounded-xl border border-slate-700/80 bg-slate-950/50 p-3" data-testid="institution-verification">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-slate-400">
          {es ? 'Se comprueba cada institución con directorios públicos. Solo se envían el nombre de la institución y el país, no sus datos personales. No comprueba acreditación.' : 'Each institution is checked against public directories. Only the institution name and country are sent, not your personal details. Accreditation is not checked.'}
        </p>
        <button
          type="button"
          disabled={loading || name.trim().length < 2 || country.trim().length < 2}
          onClick={() => void check()}
          data-testid="button-check-institution"
          className="shrink-0 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-2 text-[11px] font-bold text-indigo-300 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (es ? 'Comprobando…' : 'Checking…') : (es ? 'Comprobar institución' : 'Check institution')}
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
          {error}{' '}
          <button type="button" onClick={() => void check()} className="font-bold underline">
            {es ? 'Reintentar' : 'Retry'}
          </button>
          <button type="button" onClick={onContinueUnverified} data-testid="button-continue-unverified" className="ml-3 font-bold underline">
            {es ? 'Continuar sin verificación' : 'Continue unverified'}
          </button>
        </div>
      )}

      {result && !selected && (
        <div className="mt-3">
          <p className={`text-xs font-semibold ${result.status === 'not_found' ? 'text-amber-300' : 'text-slate-200'}`}>
            {result.status === 'not_found'
              ? (es ? 'No se pudo verificar con las fuentes disponibles. Esto no significa que la institución sea falsa.' : 'Could not verify from the available sources. This does not mean the institution is fake.')
              : (es ? 'Seleccione la institución correcta. Una coincidencia de nombre por sí sola no se verifica.' : 'Select the correct institution. A name match alone is not verified.')}
          </p>
          {result.candidates.length > 0 && (
            <div className="mt-2 space-y-2">
              {result.candidates.map((candidate) => (
                <CandidateButton key={candidate.entityId} candidate={candidate} es={es} onSelect={() => void check(candidate.entityId)} />
              ))}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
            <p className="text-[11px] leading-relaxed text-amber-200">
              {es ? 'Si su institución no aparece, puede continuar. El informe la marcará claramente como no verificada y no afirmará que sea falsa.' : 'If your institution is not listed, you may continue. The report will clearly mark it unverified and will not call it fake.'}
            </p>
            <button type="button" onClick={onContinueUnverified} data-testid="button-continue-unverified" className="mt-2 rounded-lg border border-amber-500/40 px-3 py-2 text-[11px] font-bold text-amber-200 hover:bg-amber-500/10">
              {es ? 'Continuar sin verificación' : 'Continue without verification'}
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3" data-testid="institution-verified">
          <p className="text-xs font-bold text-emerald-300">
            ✓ {es ? 'Identidad, país y categoría educativa corroborados' : 'Identity, country, and education category corroborated'}
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{selected.name}</p>
          {selected.name.trim().toLowerCase() !== name.trim().toLowerCase() && (
            <p className="mt-1 text-[11px] text-indigo-200" data-testid="text-selected-institution-name">
              {es ? 'El informe usará el nombre de la institución seleccionada que se muestra arriba, no el texto original de búsqueda.' : 'Your report will use the selected institution name above, not the original search spelling.'}
            </p>
          )}
          <p className="text-xs text-slate-400">{selected.higherEducationType} · {selected.country}</p>
          <p className="mt-2 text-[11px] text-slate-400">
            {es ? 'El directorio incluye un sitio oficial; su disponibilidad en vivo no se comprobó. Esta comprobación no verifica su título ni su equivalencia en EE. UU.' : 'The directory lists an official website; live availability was not checked. This check does not verify your individual degree or its U.S. equivalency.'}
          </p>
          {selected.description && (
            <p className="mt-2 text-[11px] text-slate-400">
              {es && selected.entityId.startsWith('https://ror.org/')
                ? selected.description.includes('as inactive')
                  ? 'ROR registra esta institución educativa como inactiva. Es evidencia histórica de identidad; no se estableció una fecha de cierre.'
                  : 'Institución educativa registrada en ROR. El registro no demuestra de forma independiente que siga operando ni su estado de acreditación.'
                : selected.description}
            </p>
          )}
          {selected.closureDate && (
            <p className="mt-2 text-xs text-amber-300">
              {es ? `Wikidata informa una fecha de cierre: ${selected.closureDate}.` : `Wikidata reports a closure date: ${selected.closureDate}.`}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {safeHref(selected.officialWebsite) && <a href={safeHref(selected.officialWebsite)!} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">{es ? 'Sitio oficial listado' : 'Listed official website'}</a>}
            {selected.sources.map((source) => safeHref(source.url) && (
              <a key={`${source.name}-${source.url}`} href={safeHref(source.url)!} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">
                {source.name === 'Internet Archive' ? (es ? 'Evidencia histórica archivada' : 'Archived historical evidence') : source.name}
              </a>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            {es ? 'Fuentes consultadas' : 'Sources retrieved'}: {selected.sources.map((source) => source.name).join(', ')} · {new Date(result.retrievedAt).toLocaleString(es ? 'es' : 'en-US')}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-amber-300">{es ? 'No es una conclusión de acreditación.' : 'This is not an accreditation finding.'}</p>
        </div>
      )}
    </div>
  );
}

function CandidateButton({ candidate, es, onSelect }: { candidate: InstitutionCandidate; es: boolean; onSelect: () => void }) {
  const eligible = candidate.countryMatch && Boolean(candidate.officialWebsite);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!eligible}
      className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="block text-xs font-bold text-white">{candidate.name}</span>
      <span className="block text-[11px] text-slate-400">{candidate.higherEducationType} · {candidate.country || (es ? 'país desconocido' : 'unknown country')}</span>
      {!candidate.countryMatch && <span className="block text-[10px] font-semibold text-amber-300">{es ? 'El país no coincide' : 'Country does not match'}</span>}
      {candidate.countryMatch && !candidate.officialWebsite && <span className="block text-[10px] font-semibold text-amber-300">{es ? 'No hay sitio oficial listado en la fuente' : 'No official website is listed by the source'}</span>}
    </button>
  );
}