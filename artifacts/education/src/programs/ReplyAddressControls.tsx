import React, { useEffect, useRef, useState } from 'react';
import { apiSchoolReplyVerification } from '../api';

interface Props {
  username: string;
  remote: boolean;
  disabled: boolean;
  es: boolean;
  included: boolean;
  onInclude: (value: boolean) => void;
}

export function ReplyAddressControls({ username, remote, disabled, es, included, onInclude }: Props) {
  const L = (en: string, sp: string) => es ? sp : en;
  const [status, setStatus] = useState<{ email: string | null; verified: boolean; codeSent?: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => {
    const v = ++version.current;
    setStatus(null); setCode(''); setError(''); setWorking(false);
    if (remote) {
      void apiSchoolReplyVerification(username).then(data => {
        if (v === version.current) setStatus(data);
      }).catch(() => { if (v === version.current) setError('unavailable'); });
    }
    return () => { version.current++; };
  }, [username, remote]);
  async function verify(action: 'request' | 'confirm') {
    if (!remote || disabled || working) return;
    const v = version.current;
    setWorking(true); setError('');
    try {
      const data = await apiSchoolReplyVerification(username, action, code);
      if (v !== version.current) return;
      setStatus(data); setCode('');
    } catch (err) {
      if (v !== version.current) return;
      setError(err instanceof Error ? err.message : 'unavailable');
    } finally { if (v === version.current) setWorking(false); }
  }
  const btn = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-indigo-200 disabled:opacity-40';
  return <div className="space-y-3 rounded-lg border border-slate-700 p-3" data-testid="reply-address-controls">
    <h5 className="font-semibold text-white">{L('Let schools reply to you (optional)', 'Permitir respuestas de las instituciones (opcional)')}</h5>
    <p className="text-sm text-slate-300">{L(
      'Only your verified account email can be shared. Verification alone sends nothing to schools. Replies go to your inbox, not to this dashboard.',
      'Solo se puede compartir el correo verificado de su cuenta. Verificarlo no envía nada a las instituciones. Las respuestas llegan a su bandeja de entrada, no a este panel.')}</p>
    {!remote ? <p className="text-sm text-amber-200">{L('Verification and sending require a configured backend. Static hosting cannot send school emails.',
      'La verificación y el envío requieren un servidor configurado. El alojamiento estático no puede enviar correos a las instituciones.')}</p>
      : status?.email ? <>
        <p className="break-all text-sm text-slate-200">{L('Account email:', 'Correo de la cuenta:')} {status.email}</p>
        {status.verified ? <label className="flex items-start gap-3 text-sm text-slate-200">
          <input type="checkbox" checked={included} disabled={disabled || working} onChange={e => onInclude(e.target.checked)} />
          {L(`Include my verified reply address: ${status.email}`, `Incluir mi correo de respuesta verificado: ${status.email}`)}
        </label> : <>
          <button type="button" className={btn} disabled={disabled || working} onClick={() => void verify('request')}>
            {L('Send verification code', 'Enviar código de verificación')}
          </button>
          {status.codeSent && <>
            <p role="status" className="text-sm text-slate-300">{L('Code accepted by the email provider. Check your inbox and spam folder. It expires in 10 minutes; five guesses maximum.',
              'El proveedor aceptó el código. Revise su bandeja de entrada y correo no deseado. Caduca en 10 minutos; máximo cinco intentos.')}</p>
            <label className="block text-sm text-slate-200">{L('Verification code', 'Código de verificación')}
              <input className="ml-2 w-28 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-white"
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                disabled={disabled || working} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            <button type="button" className={btn} disabled={disabled || working || code.length !== 6} onClick={() => void verify('confirm')}>
              {L('Verify account email', 'Verificar correo de la cuenta')}
            </button>
          </>}
        </>}
      </> : status && <p className="text-sm text-amber-200">{L('Your account needs a valid email address. Contact the administrator to update it.',
        'Su cuenta necesita un correo válido. Contacte al administrador para actualizarlo.')}</p>}
    {working && <p role="status" className="text-sm text-slate-300">{L('Working…', 'Procesando…')}</p>}
    {error && <p role="alert" className="text-sm text-amber-200">{error === 'reply_verification_rate_limited'
      ? L('Too many attempts. Try again in an hour.', 'Demasiados intentos. Intente de nuevo en una hora.')
      : ['invalid_or_expired_reply_code', 'invalid_reply_code'].includes(error)
        ? L('The code is incorrect, expired, or used up. Check it or request a new code.', 'El código es incorrecto, caducó o ya se agotó. Revíselo o solicite otro.')
        : L('Email verification is unavailable. Try again later. No information was sent to schools.', 'La verificación de correo no está disponible. Intente más tarde. No se envió información a las instituciones.')}</p>}
  </div>;
}
