import React, { useEffect, useRef, useState } from 'react';
import { apiReviewSchoolContacts, apiSendReviewedSchoolOutreach, apiFetchSchoolOutreachHistory,
  type Opportunity, type SchoolContact, type OutreachPreview, type OutreachHistoryItem, type OutreachResult } from '../api';
import { programIdentity } from '@workspace/program-catalog';

interface Props {
  username: string;
  items: Opportunity[];
  remote: boolean;
  busy: boolean;
  profileKey: string;
  es: boolean;
  remove: (item: Opportunity) => void;
  onWorkingChange?: (working: boolean) => void;
}
const btn = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-indigo-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
type Result = OutreachResult | { schoolId: string; result: 'not_attempted' };

export function ProgramOutreach({ username, items, remote, busy, profileKey, es, remove, onWorkingChange }: Props) {
  const L = (en: string, sp: string) => es ? sp : en;
  const [selected, setSelected] = useState<string[]>([]);
  const [contacts, setContacts] = useState<SchoolContact[]>([]);
  const [preview, setPreview] = useState<OutreachPreview | null>(null);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [history, setHistory] = useState<OutreachHistoryItem[]>([]);
  const [requestId, setRequestId] = useState('');
  const [attempted, setAttempted] = useState(false);
  const version = useRef(0);
  const sending = useRef(false);
  const saved = items.filter(o => o.kind === 'school');
  const savedKey = saved.map(o => `${o.id}:${o.updatedAt}`).join('|');
  useEffect(() => {
    onWorkingChange?.(working);
    return () => onWorkingChange?.(false);
  }, [working, onWorkingChange]);
  function reset() {
    version.current++; setContacts([]); setPreview(null); setConsent(false);
    setResults([]); setError(''); setAttempted(false); setWorking(false);
  }
  useEffect(() => {
    reset(); setSelected([]); setHistory([]);
    let active = true;
    if (remote) void apiFetchSchoolOutreachHistory(username).then(data => {
      if (active) setHistory(data);
    }).catch(() => { if (active) setError('history'); });
    return () => { active = false; version.current++; };
  }, [username, profileKey, savedKey, remote]);
  // Consent never survives language changes either.
  useEffect(() => { setConsent(false); }, [es]);

  async function review() {
    if (!remote || working || !selected.length) return;
    reset(); setWorking(true);
    const v = version.current;
    try {
      const response = await apiReviewSchoolContacts(username, selected);
      if (v !== version.current) return;
      setContacts(response.contacts); setPreview(response.preview);
      setRequestId(crypto.randomUUID());
    } catch { if (v === version.current) setError('review'); }
    finally { if (v === version.current) setWorking(false); }
  }
  async function send() {
    if (!preview || !consent || sending.current || attempted || !remote) return;
    sending.current = true; setWorking(true); setError(''); setAttempted(true);
    const v = version.current;
    const schools = contacts.filter(c => c.status === 'verified' && c.recipients[0])
      .map(c => ({ schoolId: c.schoolId, email: c.recipients[0]!.email }));
    try {
      const response = await apiSendReviewedSchoolOutreach(username, requestId, schools, true, preview);
      if (v !== version.current) return;
      setResults(selected.map(id => response.results.find(r => r.schoolId === id) ?? { schoolId: id, result: 'not_attempted' }));
      if (response.historySaved === false) setError('history');
      setConsent(false);
      // A failed history refresh must not erase confirmed send outcomes.
      try {
        const data = await apiFetchSchoolOutreachHistory(username);
        if (v === version.current) setHistory(data);
      } catch { if (v === version.current) setError('history'); }
    } catch (error) {
      if (v === version.current) {
        const code = error instanceof Error ? error.message : '';
        const notAttempted = ['school_outreach_preview_changed', 'unverified_school_recipient',
          'school_outreach_sender_unavailable', 'school_outreach_rate_limited', 'school_rate_limiter_unavailable',
          'school_outreach_storage_unavailable', 'school_not_saved', 'school_outreach_purpose_not_allowed',
          'unauthorized', 'Not authenticated', 'college_scorecard_api_key_not_configured'].includes(code);
        setError(notAttempted ? 'sendNotAttempted' : 'send'); setConsent(false);
        setResults(selected.map(id => ({ schoolId: id,
          result: !notAttempted && schools.some(s => s.schoolId === id) ? 'unknown' : 'not_attempted' })));
      }
    } finally {
      sending.current = false;
      if (v === version.current) setWorking(false);
    }
  }
  const status = (result: string) => result === 'sent'
    ? L('Accepted by email provider — delivery not confirmed', 'Aceptado por el proveedor de correo — entrega no confirmada')
    : result === 'failed' ? L('Provider rejected the request', 'El proveedor rechazó la solicitud')
    : result === 'unknown' ? L('Outcome unknown — do not resend automatically', 'Resultado desconocido — no reenviar automáticamente')
    : L('Not attempted', 'No se intentó');

  return <section className="space-y-4 border-t border-slate-700 pt-6" data-testid="section-program-outreach">
    <h4 className="text-lg font-bold text-white">{L('Saved programs and schools', 'Programas e instituciones guardados')}</h4>
    <p className="text-sm text-slate-300">{L('Review official contacts before sharing. No email is sent just by saving or selecting a program. Up to 10 selections.',
      'Revise los contactos oficiales antes de compartir. Guardar o seleccionar un programa no envía ningún correo. Hasta 10 selecciones.')}</p>
    {!saved.length && <p className="text-sm text-slate-400">{L('No saved programs yet.', 'Aún no hay programas guardados.')}</p>}
    {saved.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 p-3">
      <label className="flex flex-1 items-start gap-3 text-sm text-slate-200">
        <input type="checkbox" aria-label={item.title} checked={selected.includes(item.id)}
          disabled={!remote || working || busy || (!selected.includes(item.id) && selected.length >= 10)}
          onChange={() => { reset(); setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]); }} />
        <span>{item.title} · {item.organization}
          {!programIdentity(item.id) && <span className="block text-xs text-slate-400">{L('Legacy saved school · preserved', 'Institución guardada anteriormente · conservada')}</span>}
        </span>
      </label>
      {item.url?.startsWith('https://') && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-300 underline">{L('Saved page', 'Página guardada')}</a>}
      <button className={btn} disabled={working || busy} onClick={() => remove(item)}>{L('Remove', 'Eliminar')}</button>
    </div>)}
    {saved.length > 0 && <button className={btn} disabled={!remote || !selected.length || working || busy} onClick={review}>
      {working ? L('Working…', 'Procesando…') : L('Review contacts and message', 'Revisar contactos y mensaje')}
    </button>}
    {error && <p role="alert" className="text-sm text-amber-200">{error === 'history'
      ? L('History could not be refreshed. Any results shown below remain valid.', 'No se pudo actualizar el historial. Los resultados que aparecen abajo siguen siendo válidos.')
      : error === 'sendNotAttempted'
        ? L('No send was attempted. The preview, recipient verification, account permission, rate limit, or sender setup prevented sending. Review again before trying a new request.', 'No se intentó el envío. La vista previa, la verificación de destinatarios, los permisos de la cuenta, el límite de solicitudes o la configuración del remitente impidieron el envío. Revise de nuevo antes de iniciar otra solicitud.')
      : error === 'send'
        ? L('The send outcome could not be confirmed. Check history before starting another request; do not assume it failed.', 'No se pudo confirmar el resultado del envío. Revise el historial antes de iniciar otra solicitud; no suponga que falló.')
        : L('Contact review is unavailable. A configured backend, saved profile and verified official contacts are required. Try again later or visit the official school page.', 'La revisión de contactos no está disponible. Se requieren un servidor configurado, un perfil guardado y contactos oficiales verificados. Intente más tarde o visite la página oficial de la institución.')}</p>}
    {preview && <div className="space-y-4 rounded-xl border border-indigo-700 p-4" data-testid="program-outreach-preview">
      <h5 className="font-bold text-white">{L('Exact information to be shared', 'Información exacta que se compartirá')}</h5>
      <p className="text-xs text-slate-400">{L('This preview uses your profile saved on the server. If it is outdated, save your profile and review again. No official equivalency or admission decision is included.', 'Esta vista previa usa su perfil guardado en el servidor. Si está desactualizado, guarde su perfil y vuelva a revisar. No incluye una equivalencia oficial ni una decisión de admisión.')}</p>
      <pre className="whitespace-pre-wrap break-words text-sm text-slate-200">{preview.text}</pre>
      <p className="text-sm font-semibold text-slate-200">{L('Subject:', 'Asunto:')} VerifED credential information / información de credenciales</p>
      {contacts.map(c => <div key={c.schoolId} className="text-sm text-slate-300">
        <p className="font-semibold">{saved.find(o => o.id === c.schoolId)?.title} · {c.schoolName}</p>
        {c.status === 'verified' && c.recipients[0] ? <>
          <p>{L('Recipient:', 'Destinatario:')} {c.recipients[0].email}</p>
          <a className="text-indigo-300 underline" href={c.recipients[0].sourceUrl} target="_blank" rel="noopener noreferrer">{L('Official recipient source', 'Fuente oficial del destinatario')}</a>
        </> : <p>{L('No verified email; no send will be attempted.', 'Sin correo verificado; no se intentará el envío.')}
          {c.fallbackUrl?.startsWith('https://') && <> <a className="text-indigo-300 underline" href={c.fallbackUrl} target="_blank" rel="noopener noreferrer">{L('Contact school directly', 'Contactar directamente a la institución')}</a></>}
        </p>}
      </div>)}
      <label className="flex items-start gap-3 text-sm text-slate-200">
        <input type="checkbox" checked={consent} disabled={working || attempted} onChange={e => setConsent(e.target.checked)} />
        {L('I reviewed this exact information and the recipients above. I consent to sharing it with those verified contacts.', 'Revisé esta información exacta y los destinatarios indicados. Doy mi consentimiento para compartirla con esos contactos verificados.')}
      </label>
      <button className={btn} onClick={send} disabled={!consent || working || attempted || !contacts.some(c => c.status === 'verified' && c.recipients[0])}>
        {L('Send reviewed information', 'Enviar la información revisada')}
      </button>
      <p className="text-xs text-slate-400">{L('Acceptance by the provider does not confirm delivery or a school response. Never resend an unknown outcome automatically.', 'La aceptación del proveedor no confirma la entrega ni una respuesta de la institución. Nunca reenvíe automáticamente un resultado desconocido.')}</p>
      <p className="text-xs text-slate-400">{L('If several programs share a recipient, only one message is sent to that email address.', 'Si varios programas comparten un destinatario, solo se envía un mensaje a esa dirección de correo.')}</p>
    </div>}
    {results.length > 0 && <div role="status" data-testid="program-outreach-results">{results.map(r => <p key={r.schoolId} className="text-sm text-slate-200">
      {saved.find(o => o.id === r.schoolId)?.title} {('recipient' in r && r.recipient) || ''} — {status(r.result)}
    </p>)}</div>}
    {history.length > 0 && <details className="text-sm text-slate-300"><summary>{L('Outreach history', 'Historial de comunicaciones')}</summary>
      {history.map((h, i) => <p key={i}>{h.schoolName} · {h.recipient} · {new Date(h.sentAt).toLocaleString(es ? 'es' : 'en')} — {status(h.result)}</p>)}
    </details>}
  </section>;
}
