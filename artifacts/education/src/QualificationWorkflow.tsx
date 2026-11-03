import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { apiVerifyInstitution, type EvalProfile } from './api';
import {
  type Qualification,
  normalizeQualifications,
  guidanceFor,
  qualificationLabels,
  buildDossierHtml,
  publicEvidenceUrl,
} from './qualificationGuidance';
import { InstitutionVerification } from './InstitutionVerification';
import { CountryPicker } from './CountryPicker';

type Lang = 'en' | 'es';
type Draft = Omit<Qualification, 'id'>;
type SyncState = { kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string };

const UI = {
  en: {
    title: 'Your qualifications', sub: 'Add every award separately, from any country. Keep the original award name exactly as written on your documents.',
    goal: 'Shared goal', goalPh: 'e.g., Employment as an accountant in Texas', saveGoal: 'Save goal',
    add: 'Add qualification', edit: 'Edit', del: 'Delete', save: 'Save qualification', cancel: 'Cancel',
    confirmDel: 'Delete this qualification permanently?', confirmYes: 'Yes, delete', keep: 'Keep it',
    empty: 'No qualifications yet', emptyBody: 'Start with the award you want guidance on. Unknown details are fine; only the original award name is required.',
    awardReq: 'The original award name is required.', saving: 'Saving…', saved: 'Saved on this device.',
    syncErr: 'Not saved', retryHint: 'Your entries are still in the form. Try again.',
    unverified: 'Unverified institution', checkNote: 'Check now, or we will attempt a public evidence lookup when you save. An unavailable source will not block guidance.',
    evidenceReset: 'Institution or country changed: previous evidence will be cleared when saved.',
    guidance: 'Guidance', select: 'Use for school and job tools', selected: 'Selected for school and job tools',
    limits: 'What this guidance cannot tell you', context: 'Context', missing: 'Missing details', terminology: 'Terminology',
    career: 'Career', licensing: 'Licensing', refs: 'Sources', download: 'Download dossier (all qualifications)',
    editing: 'Editing qualification', adding: 'New qualification', notProvided: 'Not provided',
  },
  es: {
    title: 'Sus titulaciones', sub: 'Agregue cada título por separado, de cualquier país. Conserve el nombre original exactamente como aparece en sus documentos.',
    goal: 'Objetivo compartido', goalPh: 'p. ej., Empleo como contador en Texas', saveGoal: 'Guardar objetivo',
    add: 'Agregar titulación', edit: 'Editar', del: 'Eliminar', save: 'Guardar titulación', cancel: 'Cancelar',
    confirmDel: '¿Eliminar esta titulación de forma permanente?', confirmYes: 'Sí, eliminar', keep: 'Conservar',
    empty: 'Aún no hay titulaciones', emptyBody: 'Empiece con el título sobre el que desea orientación. Puede dejar datos desconocidos; solo se requiere el nombre original del título.',
    awardReq: 'El nombre original del título es obligatorio.', saving: 'Guardando…', saved: 'Guardado en este dispositivo.',
    syncErr: 'No guardado', retryHint: 'Sus datos siguen en el formulario. Inténtelo de nuevo.',
    unverified: 'Institución no verificada', checkNote: 'Compruebe ahora o intentaremos una consulta de evidencia pública al guardar. Una fuente no disponible no bloqueará la orientación.',
    evidenceReset: 'Cambió la institución o el país: la evidencia anterior se borrará al guardar.',
    guidance: 'Orientación', select: 'Usar en herramientas de escuelas y empleo', selected: 'Seleccionada para escuelas y empleo',
    limits: 'Lo que esta orientación no puede indicar', context: 'Contexto', missing: 'Datos faltantes', terminology: 'Terminología',
    career: 'Carrera', licensing: 'Licencias', refs: 'Fuentes', download: 'Descargar expediente (todas las titulaciones)',
    editing: 'Editando titulación', adding: 'Nueva titulación', notProvided: 'No indicado',
  },
} as const;

const EMPTY: Draft = {
  awardName: '', institution: '', country: '', field: '', duration: '',
  completion: 'unknown', awardType: 'unknown', evidenceStatus: 'not_checked',
};

const STATUS_TONE: Record<Qualification['evidenceStatus'], string> = {
  corroborated: 'border-[#A8D9BC] bg-[#E8F6EE] text-[#1C6B45]',
  not_checked: 'border-[#F2D29E] bg-[#FFF4E2] text-[#8A4500]',
  not_found: 'border-[#F2D29E] bg-[#FFF4E2] text-[#8A4500]',
  ambiguous: 'border-[#B9D7EA] bg-[#EAF4FB] text-[#0B5A80]',
  unavailable: 'border-[#E2E4F3] bg-[#F3F4F8] text-[#4B5568]',
};

const inputCls = 'w-full min-h-11 rounded-2xl border border-[#D9DCF5] bg-[#FAFAFF] px-4 py-2.5 text-[15px] text-[#0F172A] placeholder:text-[#8C93A8] focus:border-[#5B4FE9] focus:outline-none focus:ring-4 focus:ring-[#5B4FE9]/15';
const btnGhost = 'inline-flex min-h-10 items-center rounded-full border border-[#D9DCF5] bg-[#FFFFFE] px-4 text-sm font-semibold text-[#0F172A] hover:border-[#5B4FE9] disabled:opacity-50';
const btnPrimary = 'vf-btn !min-h-11 !text-sm disabled:opacity-50';
const labelCls = 'mb-1.5 block text-sm font-semibold text-[#273449]';

function newId() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function QualificationWorkflow({
  lang, username, initialProfile, onProfileChange, onActiveQualification,
}: {
  lang: Lang;
  username: string;
  initialProfile: EvalProfile;
  onProfileChange: (profile: EvalProfile) => Promise<void>;
  onActiveQualification: (q: Qualification | null) => void;
}) {
  const t = UI[lang];
  const L = qualificationLabels(lang);
  const lbl = (k: string) => L[k] ?? k;

  const [quals, setQuals] = useState<Qualification[]>(() => normalizeQualifications(initialProfile));
  const [purpose, setPurpose] = useState(initialProfile.purpose ?? '');
  const [savedPurpose, setSavedPurpose] = useState(initialProfile.purpose ?? '');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formErr, setFormErr] = useState('');
  const [continuedUnverified, setContinuedUnverified] = useState(false);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle' });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => normalizeQualifications(initialProfile)[0]?.id ?? null);
  const [openGuidance, setOpenGuidance] = useState<string | null>(null);
  const originalRef = useRef<{ institution: string; country: string } | null>(null);

  const active = useMemo(() => quals.find((q) => q.id === activeId) ?? null, [quals, activeId]);
  const activeCb = useRef(onActiveQualification);
  activeCb.current = onActiveQualification;
  useEffect(() => { activeCb.current(active); }, [active]);

  async function persist(next: Qualification[], nextPurpose: string): Promise<boolean> {
    setSync({ kind: 'saving' });
    const first = next[0];
    const profile = {
      ...initialProfile,
      purpose: nextPurpose,
      qualifications: next,
      country: first?.country || '',
      institution: first?.institution || '',
      degree: first?.awardName || '',
      field: first?.field || '',
    } as EvalProfile;
    try {
      await onProfileChange(profile);
      setSync({ kind: 'saved' });
      return true;
    } catch (err) {
      setSync({ kind: 'error', message: err instanceof Error && err.message ? err.message : '' });
      return false;
    }
  }

  function startAdd() {
    originalRef.current = null;
    setDraft({ ...EMPTY });
    setFormErr('');
    setContinuedUnverified(false);
    setEditingId('new');
  }
  function startEdit(q: Qualification) {
    originalRef.current = { institution: q.institution, country: q.country };
    const { id: _id, ...rest } = q;
    void _id;
    setDraft({ ...rest });
    setFormErr('');
    setContinuedUnverified(false);
    setEditingId(q.id);
  }

  const identityChanged = !!originalRef.current && editingId !== 'new' && (
    originalRef.current.institution.trim() !== draft.institution.trim() ||
    originalRef.current.country.trim() !== draft.country.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.awardName.trim()) { setFormErr(t.awardReq); return; }
    let rec: Qualification = { ...draft, awardName: draft.awardName.trim(), id: editingId === 'new' || !editingId ? newId() : editingId };
    if (rec.evidenceStatus === 'not_checked' && rec.institution.trim().length >= 2 && rec.country.trim().length >= 2) {
      setSync({ kind: 'saving' });
      try {
        const verification = await apiVerifyInstitution(rec.institution, rec.country);
        rec = { ...rec, verification, evidenceStatus: verification.status === 'verified' ? 'corroborated' : verification.status };
      } catch { rec = { ...rec, verification: undefined, evidenceStatus: 'unavailable' }; }
    }
    if (rec.evidenceStatus === 'corroborated' && rec.verification?.selected) {
      rec.institution = rec.verification.selected.name;
    }
    const next = editingId === 'new' ? [...quals, rec] : quals.map((q) => (q.id === rec.id ? rec : q));
    if (await persist(next, purpose)) {
      setQuals(next);
      setSavedPurpose(purpose);
      if (!activeId) setActiveId(rec.id);
      setEditingId(null);
    }
  }

  async function remove(id: string) {
    const next = quals.filter((q) => q.id !== id);
    if (await persist(next, purpose)) {
      setQuals(next);
      setSavedPurpose(purpose);
      setConfirmDel(null);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
    }
  }

  async function saveGoal() {
    if (await persist(quals, purpose)) setSavedPurpose(purpose);
  }

  function download() {
    const html = buildDossierHtml(quals, lang, savedPurpose);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verifed-guidance.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const busy = sync.kind === 'saving';

  const goalSteps = es(lang);
  return (
    <section className="space-y-6" data-testid="qualification-workflow" aria-labelledby="qw-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-5">
          <span aria-hidden="true" className="vf-display hidden sm:flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#5B4FE9] font-bold text-[#FCFCFF]">01</span>
          <div>
            <p className="text-sm font-semibold text-[#3F35C2]">{username}</p>
            <h2 id="qw-title" className="mt-1 text-[28px] sm:text-[36px] font-bold leading-tight text-[#0F172A]">{t.title}</h2>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-[#4B5568]">{t.sub}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quals.length > 0 && (
            <button type="button" onClick={download} data-testid="button-download-dossier" className={btnGhost}>{t.download}</button>
          )}
          <button type="button" onClick={startAdd} disabled={editingId !== null || busy || quals.length >= 50} data-testid="button-add-qualification" className={btnPrimary}>+ {t.add}</button>
        </div>
      </header>
      {quals.length >= 50 && <p className="text-sm text-[#4B5568]">{lang === 'es' ? 'Límite de 50 titulaciones por perfil.' : 'Limit: 50 qualifications per profile.'}</p>}

      <div className="grid gap-4 rounded-[28px] bg-[#EEF0FF] p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
        <div>
          <label htmlFor="qw-goal" className={labelCls}>{t.goal}</label>
          <p className="mb-2 text-sm text-[#4B5568]">{goalSteps.goalHint}</p>
          <select id="qw-goal" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls + ' bg-[#FFFFFE]'} data-testid="input-goal">
            <option value="">{lang === 'es' ? 'Seleccione un objetivo' : 'Select a goal'}</option>
            <option value="University Admission">{lang === 'es' ? 'Admisión universitaria' : 'University admission'}</option>
            <option value="Employment & HR">{lang === 'es' ? 'Empleo / RR. HH.' : 'Employment / HR'}</option>
            <option value="Professional Licensing">{lang === 'es' ? 'Licencia profesional' : 'Professional licensing'}</option>
            <option value="Immigration (USCIS)">{lang === 'es' ? 'Inmigración (USCIS)' : 'Immigration (USCIS)'}</option>
          </select>
        </div>
        <button type="button" onClick={() => void saveGoal()} disabled={busy || purpose === savedPurpose} data-testid="button-save-goal" className={btnGhost + ' !min-h-11'}>{t.saveGoal}</button>
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] text-sm" data-testid="status-sync">
        {sync.kind === 'saving' && <span className="text-[#4B5568]">{t.saving}</span>}
        {sync.kind === 'saved' && <span className="font-medium text-[#1C6B45]">{t.saved}</span>}
        {sync.kind === 'error' && (
          <span role="alert" className="text-[#A8231B]"><strong>{t.syncErr}.</strong> {t.retryHint}</span>
        )}
      </div>

      {editingId && (
        <form onSubmit={(e) => void submit(e)} className="vf-card overflow-hidden" data-testid="form-qualification" noValidate>
          <div className="border-b border-[#E2E4F3] bg-[#FAFAFF] px-5 py-4 sm:px-8">
            <h3 className="text-xl font-bold text-[#0F172A]">{editingId === 'new' ? t.adding : t.editing}</h3>
          </div>
          <fieldset disabled={busy} className="contents">
          <div className="space-y-8 p-5 sm:p-8">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-[#3F35C2]">{goalSteps.groupAward}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="qw-award" label={`${lbl('awardName')} *`}>
                  <input id="qw-award" required maxLength={300} aria-invalid={!!formErr} value={draft.awardName}
                    onChange={(e) => { setDraft({ ...draft, awardName: e.target.value }); setFormErr(''); }} className={inputCls} data-testid="input-award-name" />
                </Field>
                {formErr && <p role="alert" className="mt-2 text-sm text-[#A8231B]" data-testid="error-award-name">{formErr}</p>}
              </div>
              <Field id="qw-type" label={lbl('awardType')}>
                <select id="qw-type" value={draft.awardType} onChange={(e) => setDraft({ ...draft, awardType: e.target.value as Draft['awardType'] })} className={inputCls} data-testid="select-award-type">
                  {(['academic', 'professional', 'unknown'] as const).map((k) => <option key={k} value={k}>{lbl(k)}</option>)}
                </select>
              </Field>
              <Field id="qw-comp" label={lbl('completion')}>
                <select id="qw-comp" value={draft.completion} onChange={(e) => setDraft({ ...draft, completion: e.target.value as Draft['completion'] })} className={inputCls} data-testid="select-completion">
                  {(['completed', 'in_progress', 'not_completed', 'unknown'] as const).map((k) => <option key={k} value={k}>{lbl(k)}</option>)}
                </select>
              </Field>
              <Field id="qw-field" label={lbl('field')}>
                <input id="qw-field" maxLength={300} value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value })} className={inputCls} data-testid="input-field" />
              </Field>
              <Field id="qw-dur" label={lbl('duration')}>
                <input id="qw-dur" maxLength={300} value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} className={inputCls} data-testid="input-duration" />
              </Field>
            </div>
          </div>

          <div className="border-t border-[#E2E4F3] pt-8">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-[#3F35C2]">{goalSteps.groupWhere}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="qw-inst" label={lbl('institution')}>
                <input id="qw-inst" maxLength={300} value={draft.institution} onChange={(e) => setDraft({ ...draft, institution: e.target.value, verification: undefined, evidenceStatus: 'not_checked' })} className={inputCls} data-testid="input-institution" />
              </Field>
              <label className="block">
                <span className={labelCls}>{lbl('country')}</span>
                <CountryPicker value={draft.country} onChange={(v) => setDraft({ ...draft, country: v, verification: undefined, evidenceStatus: 'not_checked' })} className={inputCls} placeholder={lang === 'es' ? 'Seleccione un país (si lo conoce)' : 'Select a country (if known)'} data-testid="input-country" />
              </label>
            </div>
            <div className="mt-5 rounded-[20px] bg-[#FAFAFF] border border-[#E2E4F3] p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#273449]">{lbl('evidenceStatus')}</span>
                <StatusPill status={draft.evidenceStatus} label={draft.evidenceStatus === 'not_checked' ? t.unverified : lbl(draft.evidenceStatus)} />
              </div>
              {identityChanged && <p className="mt-2 text-sm text-[#8A4500]" data-testid="text-evidence-reset">{t.evidenceReset}</p>}
              <p className="mt-1 text-sm text-[#4B5568]">{t.checkNote}</p>
              <InstitutionVerification
                key={editingId}
                name={draft.institution}
                country={draft.country}
                lang={lang}
                initialVerification={identityChanged ? undefined : draft.verification}
                initialStatus={identityChanged ? undefined : draft.evidenceStatus}
                autoCheck={false}
                onChange={() => { /* outcome handled via onOutcome */ }}
                onContinueUnverified={() => {
                  setContinuedUnverified(true);
                  document.querySelector<HTMLButtonElement>('[data-testid="button-save-qualification"]')?.focus();
                }}
                onOutcome={(status, verification) => setDraft((d) => ({ ...d, evidenceStatus: status, verification }))}
              />
              {continuedUnverified && draft.evidenceStatus !== 'corroborated' && <p role="status" className="mt-2 text-sm text-[#8A4500]">{lang === 'es' ? 'Puede guardar la titulación a continuación. La orientación y el expediente conservarán el estado no verificado.' : 'You can save the qualification below. Guidance and the dossier will retain its unverified status.'}</p>}
            </div>
          </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[#E2E4F3] bg-[#FAFAFF] px-5 py-4 sm:px-8">
            <button type="submit" disabled={busy} data-testid="button-save-qualification" className={btnPrimary}>
              {busy ? t.saving : t.save}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditingId(null)} data-testid="button-cancel-qualification" className={btnGhost + ' !min-h-11'}>{t.cancel}</button>
          </div>
          </fieldset>
        </form>
      )}

      {quals.length === 0 && !editingId && (
        <div className="rounded-[28px] border-2 border-dashed border-[#C7CBFA] bg-[#FFFFFE] px-6 py-12 text-center" data-testid="empty-qualifications">
          <span aria-hidden="true" className="vf-display mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF0FF] text-2xl font-bold text-[#3F35C2]">+</span>
          <p className="mt-4 text-xl font-bold text-[#0F172A]">{t.empty}</p>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-[#4B5568]">{t.emptyBody}</p>
          <button type="button" onClick={startAdd} className={btnPrimary + ' mt-6'} data-testid="button-add-first">{t.add}</button>
        </div>
      )}

      <ol className="space-y-4">
        {quals.map((q, i) => {
          const isActive = q.id === activeId;
          const g = openGuidance === q.id ? guidanceFor(q, lang, savedPurpose) : null;
          return (
            <li key={q.id} className={`rounded-[28px] border p-5 sm:p-6 transition-colors ${isActive ? 'border-[#5B4FE9] bg-[#FFFFFE] shadow-[0_24px_48px_-36px_rgba(67,56,202,0.45)]' : 'border-[#E2E4F3] bg-[#FFFFFE]'}`} data-testid={`card-qualification-${q.id}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-4">
                  <span aria-hidden="true" className={`vf-display flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${isActive ? 'bg-[#5B4FE9] text-[#FCFCFF]' : 'bg-[#EEF0FF] text-[#3F35C2]'}`}>{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <p className="break-words text-lg font-bold text-[#0F172A]" lang="" data-testid={`text-award-${q.id}`}>{q.awardName}</p>
                    <p className="mt-0.5 text-sm text-[#4B5568]">
                      {q.institution || t.notProvided} · {q.country || t.notProvided}{q.field ? ` · ${q.field}` : ''}{q.duration ? ` · ${q.duration}` : ''}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <StatusPill status={q.evidenceStatus} label={q.evidenceStatus === 'not_checked' ? t.unverified : lbl(q.evidenceStatus)} testId={`status-evidence-${q.id}`} />
                      <span className="rounded-full bg-[#F3F4F8] px-2.5 py-1 text-xs font-medium text-[#273449]">{lbl(q.completion)}</span>
                      <span className="rounded-full bg-[#F3F4F8] px-2.5 py-1 text-xs font-medium text-[#273449]">{lbl(q.awardType)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  <button type="button" aria-pressed={isActive} onClick={() => setActiveId(q.id)} data-testid={`button-select-${q.id}`}
                    className={isActive ? 'inline-flex min-h-10 items-center rounded-full bg-[#0F172A] px-4 text-sm font-semibold text-[#FCFCFF]' : btnGhost}>
                    {isActive ? t.selected : t.select}
                  </button>
                  <button type="button" aria-expanded={openGuidance === q.id} onClick={() => setOpenGuidance(openGuidance === q.id ? null : q.id)} data-testid={`button-guidance-${q.id}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#EEF0FF] px-4 text-sm font-semibold text-[#3F35C2] hover:bg-[#E1E4FF]">{t.guidance}<span aria-hidden="true" className={`transition-transform ${openGuidance === q.id ? 'rotate-180' : ''}`}>▾</span></button>
                  <button type="button" disabled={editingId !== null} onClick={() => startEdit(q)} aria-label={`${t.edit}: ${q.awardName}`} data-testid={`button-edit-${q.id}`}
                    className={btnGhost}>{t.edit}</button>
                  <button type="button" disabled={busy || editingId !== null} onClick={() => setConfirmDel(q.id)} aria-label={`${t.del}: ${q.awardName}`} data-testid={`button-delete-${q.id}`}
                    className="inline-flex min-h-10 items-center rounded-full border border-[#F2B8B2] px-4 text-sm font-semibold text-[#A8231B] hover:bg-[#FDECEA] disabled:opacity-50">{t.del}</button>
                </div>
              </div>

              {confirmDel === q.id && (
                <div role="alertdialog" aria-label={t.confirmDel} className="mt-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-[#F2B8B2] bg-[#FDECEA] p-4" data-testid={`confirm-delete-${q.id}`}>
                  <span className="text-sm font-medium text-[#A8231B]">{t.confirmDel}</span>
                  <button type="button" disabled={busy} onClick={() => void remove(q.id)} data-testid={`button-confirm-delete-${q.id}`} className="inline-flex min-h-10 items-center rounded-full bg-[#B3261E] px-4 text-sm font-semibold text-[#FCFCFF] disabled:opacity-50">{t.confirmYes}</button>
                  <button type="button" onClick={() => setConfirmDel(null)} className={btnGhost}>{t.keep}</button>
                </div>
              )}

              {g && (
                <div className="mt-6 grid gap-5 border-t border-[#E2E4F3] pt-6 text-[15px] leading-relaxed text-[#273449] lg:grid-cols-2" data-testid={`guidance-${q.id}`}>
                  <div className="lg:col-span-2 rounded-[20px] border-l-4 border-[#B45309] bg-[#FFF4E2] p-4">
                    {q.evidenceStatus !== 'corroborated' && <p className="mb-1 text-sm font-bold text-[#8A4500]">{t.unverified}</p>}
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8A4500]">{t.limits}</p>
                    <p className="mt-1 text-[#5C3100]">{g.limits}</p>
                  </div>
                  <GBlock title={t.context} body={g.context} />
                  {g.missing.length > 0 && (
                    <div className="rounded-[20px] bg-[#FAFAFF] border border-[#E2E4F3] p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F35C2]">{t.missing}</p>
                      <ul className="mt-2 list-disc pl-5">{g.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                    </div>
                  )}
                  <GBlock title={t.terminology} body={g.terminology} />
                  <GBlock title={t.career} body={g.career} />
                  <GBlock title={t.licensing} body={g.licensing} />
                  {q.verification && <div className="rounded-[20px] border border-[#E2E4F3] p-4 text-sm lg:col-span-2">
                    <p>{lang === 'es' ? 'Instantánea histórica de evidencia institucional; no autentica el título ni determina acreditación, equivalencia o licencia.' : 'Historical institution-evidence snapshot; not award authentication, accreditation, equivalency or licensure.'}</p>
                    <p className="text-[#4B5568]">{q.verification.retrievedAt}</p>
                    {q.verification.selected && <p>{q.verification.selected.name} · {q.verification.selected.country} · {q.verification.selected.higherEducationType}</p>}
                    {q.verification.selected?.sources.map(s => publicEvidenceUrl(s.url) && <p key={s.url}><a href={publicEvidenceUrl(s.url)!} target="_blank" rel="noopener noreferrer" className="text-[#3F35C2] underline">{s.name}</a> — {s.retrievedAt}</p>)}
                  </div>}
                  {g.references.length > 0 && (
                    <div className="lg:col-span-2">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F35C2]">{t.refs}</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        {g.references.map((r) => (
                          <li key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#3F35C2] underline underline-offset-2">{r.name}</a></li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function es(lang: Lang) {
  return lang === 'es'
    ? { goalHint: 'Se usa para adaptar la orientación de todas sus titulaciones.', groupAward: 'Sobre el título', groupWhere: 'Dónde lo obtuvo' }
    : { goalHint: 'Used to tailor guidance across all of your qualifications.', groupAward: 'About the award', groupWhere: 'Where you earned it' };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function GBlock({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F35C2]">{title}</p>
      <p className="mt-2">{body}</p>
    </div>
  );
}

function StatusPill({ status, label, testId }: { status: Qualification['evidenceStatus']; label: string; testId?: string }) {
  return <span data-testid={testId} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}>{label}</span>;
}

