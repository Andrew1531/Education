import React, { useEffect, useMemo, useState } from 'react';
import type { Opportunity } from '../api';
import { getUsers } from '../userStore';
import { readAccountEmail } from './accountEmailIdentity';
import { accountEmailDrafts, emailComposeUrl, validAccountEmail, type CorrespondenceProfile } from './accountEmail';

interface Props {
  username: string;
  items: Opportunity[];
  profile: CorrespondenceProfile;
  es: boolean;
  disabled?: boolean;
}
const btn = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-indigo-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
const linkBtn = 'inline-block rounded-lg border border-indigo-600 px-3 py-2 text-sm text-indigo-200 hover:bg-slate-700';

function ownerEmail(username: string): string {
  try {
    const name = username.trim().toLowerCase();
    if (!name) return '';
    const authenticatedEmail = readAccountEmail(username);
    if (authenticatedEmail) return authenticatedEmail;
    const user = getUsers().find(u => u.username.trim().toLowerCase() === name);
    const email = (user?.email || '').trim();
    return validAccountEmail(email) ? email : '';
  } catch { return ''; }
}

export function AccountEmailComposer({ username, items, profile, es, disabled = false }: Props) {
  const L = (en: string, sp: string) => es ? sp : en;
  const email = ownerEmail(username);
  const savedKey = items.filter(i => i.kind === 'school').map(i => `${i.id}:${i.updatedAt}`).join('|');
  const profileKey = JSON.stringify([profile.country, profile.institution, profile.degree, profile.field, profile.purpose]);
  const reviewKey = JSON.stringify([username, email, savedKey, profileKey, es]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drafts = useMemo(() => accountEmailDrafts(items, profile, es), [savedKey, profileKey, es]);
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [copyState, setCopyState] = useState<Record<string, string>>({});
  useEffect(() => { setConsent({}); setCopyState({}); }, [username, email, savedKey, profileKey, es]);

  async function copy(id: string, kind: 'message' | 'subject', text: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      setCopyState(s => ({ ...s, [id]: `${kind}:ok` }));
    } catch { setCopyState(s => ({ ...s, [id]: `${kind}:fail` })); }
  }
  const copyMsg = (state?: string) => {
    if (!state) return null;
    const [kind, result] = state.split(':');
    const what = kind === 'subject' ? L('Subject', 'Asunto') : L('Message', 'Mensaje');
    return result === 'ok'
      ? `${what} ${L('copied. Nothing has been sent.', 'copiado. No se ha enviado nada.')}`
      : L('Copy failed. Your browser blocked clipboard access; select the text above and copy it manually.',
        'No se pudo copiar. El navegador bloqueó el portapapeles; seleccione el texto de arriba y cópielo manualmente.');
  };

  if (!drafts.length) return null;
  return <section className="space-y-4 border-t border-slate-700 pt-6" data-testid="section-account-email">
    <h4 className="text-lg font-bold text-white">{L('Write to schools from your account email', 'Escribir a las instituciones desde el correo de su cuenta')}</h4>
    <p className="text-sm text-slate-300">{L('You send these messages yourself, from your own email provider. Send from the same address saved on your account; schools reply to the mailbox that actually sends the message.',
      'Usted envía estos mensajes desde su propio proveedor de correo. Envíelos desde la misma dirección guardada en su cuenta; las instituciones responden al buzón que realmente envía el mensaje.')}</p>
    <p className="text-xs text-slate-400">{L('Opening a compose window or copying text does not send anything. VerifED cannot see, track or confirm sending, delivery or replies here.',
      'Abrir una ventana de redacción o copiar texto no envía nada. VerifED no puede ver, rastrear ni confirmar aquí el envío, la entrega ni las respuestas.')}</p>
    {email
      ? <p className="text-sm text-slate-200" data-testid="text-account-email">{L('Account email (sender):', 'Correo de la cuenta (remitente):')} <span className="break-all font-semibold">{email}</span></p>
      : <p role="status" className="text-sm text-amber-200" data-testid="status-account-email-missing">{L('No valid email is available for this account, so compose links are unavailable. For a server account, sign out and sign in again to load its email. You can still copy the reviewed message into your own email service.',
        'No hay un correo válido disponible para esta cuenta, por lo que los enlaces de redacción no están disponibles. Si su cuenta está en el servidor, cierre sesión y vuelva a iniciarla para cargar su correo. Aún puede copiar el mensaje revisado en su propio servicio de correo.')}</p>}
    {drafts.map((d, idx) => {
      const consentId = `${reviewKey}:${d.id}`;
      const ok = !!consent[consentId];
      const gmail = ok && !disabled ? emailComposeUrl('gmail', email, d) : null;
      const outlook = ok && !disabled ? emailComposeUrl('outlook', email, d) : null;
      const canCompose = !!email && !!d.recipient;
      return <div key={d.id} className="space-y-3 rounded-xl border border-indigo-700 p-4" data-testid={`card-account-email-${idx}`}>
        <h5 className="font-bold text-white">{d.institution}</h5>
        <ul className="list-disc pl-5 text-sm text-slate-300">{d.programs.map(p => <li key={p}>{p}</li>)}</ul>
        <dl className="grid gap-1 text-sm text-slate-300">
          <div><dt className="inline font-semibold">{L('Recipient:', 'Destinatario:')} </dt>
            <dd className="inline break-all" data-testid={`text-recipient-${idx}`}>{d.recipient
              || L('No reviewed public email. Use the official contact page; no address is guessed.', 'Sin correo público revisado. Use la página oficial de contacto; no se adivina ninguna dirección.')}</dd></div>
          <div><dt className="inline font-semibold">{d.recipient ? L('Official source:', 'Fuente oficial:') : L('Official contact page:', 'Página oficial de contacto:')} </dt>
            <dd className="inline"><a className="break-all text-indigo-300 underline" href={d.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-source-${idx}`}>{d.sourceUrl}</a>
              {d.checkedAt && <> · {L('checked', 'revisado')} {d.checkedAt}</>}</dd></div>
          <div><dt className="inline font-semibold">{L('Subject:', 'Asunto:')} </dt><dd className="inline" data-testid={`text-subject-${idx}`}>{d.subject}</dd></div>
        </dl>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/60 p-3 text-sm text-slate-200" data-testid={`text-body-${idx}`}>{d.body}</pre>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={disabled} onClick={() => copy(d.id, 'message', d.body)} data-testid={`button-copy-message-${idx}`}>{L('Copy message', 'Copiar mensaje')}</button>
          <button type="button" className={btn} disabled={disabled} onClick={() => copy(d.id, 'subject', d.subject)} data-testid={`button-copy-subject-${idx}`}>{L('Copy subject', 'Copiar asunto')}</button>
        </div>
        {copyState[d.id] && <p role="status" className={copyState[d.id].endsWith(':ok') ? 'text-sm text-slate-300' : 'text-sm text-amber-200'} data-testid={`status-copy-${idx}`}>{copyMsg(copyState[d.id])}</p>}
        {canCompose && <>
          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input type="checkbox" checked={ok} disabled={disabled} data-testid={`checkbox-consent-${idx}`}
              onChange={e => { const v = e.target.checked; setConsent(c => ({ ...c, [consentId]: v })); }} />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{L(`I reviewed the recipient, source, subject and message above. I will send it myself from ${email}, and I understand opening my email provider does not send it.`,
              `Revisé el destinatario, la fuente, el asunto y el mensaje de arriba. Lo enviaré yo desde ${email} y entiendo que abrir mi proveedor de correo no lo envía.`)}</span>
          </label>
          {gmail && outlook
            ? <div className="flex flex-wrap gap-2">
              <a className={linkBtn} href={gmail} target="_blank" rel="noopener noreferrer" data-testid={`link-gmail-${idx}`}>{L('Open in Gmail (not sent yet)', 'Abrir en Gmail (aún no enviado)')}</a>
              <a className={linkBtn} href={outlook} target="_blank" rel="noopener noreferrer" data-testid={`link-outlook-${idx}`}>{L('Open in Outlook (not sent yet)', 'Abrir en Outlook (aún no enviado)')}</a>
            </div>
            : <p className="text-xs text-slate-400">{L('Compose links appear after you confirm the review.', 'Los enlaces de redacción aparecen después de confirmar la revisión.')}</p>}
        </>}
      </div>;
    })}
  </section>;
}
