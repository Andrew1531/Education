import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'wouter';

type Lang = 'en' | 'es';
type Action = { kind: 'route'; href: string; label: string } | { kind: 'external'; href: string; label: string } | { kind: 'profile'; label: string };
type Service = {
  id: string; title: string; short: string; lead: string; question: string;
  helps: string[]; bring: string[]; limit: string; primary: Action; secondary: Action;
};

const COPY: Record<Lang, { eyebrow: string; h: string; sub: string; helps: string; bring: string; limit: string; tablist: string; ext: string; services: Service[] }> = {
  en: {
    eyebrow: 'What VerifED helps with', h: 'Pick the question you are facing right now.',
    sub: 'Each area explains what you can do here, what to have ready and where our guidance stops.',
    helps: 'What you can do here', bring: 'Have ready', limit: 'Where this stops', tablist: 'VerifED services', ext: '(opens an external site)',
    services: [
      {
        id: 'education', title: 'Education Guidance', short: 'Understand your awards in U.S. terms',
        question: '“How do I describe my degree to someone in the U.S.?”',
        lead: 'Record every qualification under its original name, then read plain-language context on U.S. education terms with cited sources.',
        helps: ['Add each award separately: diploma, degree, professional certificate', 'See U.S. terminology explained without a forced equivalency', 'Download a dossier listing every qualification and its open questions'],
        bring: ['Award name exactly as written', 'Institution, country and years of study'],
        limit: 'We never assign an official U.S. equivalent. Only a recognized evaluator or the receiving institution can.',
        primary: { kind: 'profile', label: 'Start your profile' },
        secondary: { kind: 'route', href: '/guides/foreign-degree-on-resume', label: 'Guide: foreign degree on a U.S. resume' },
      },
      {
        id: 'evaluation', title: 'Evaluation Resources', short: 'Know when an official evaluation is needed',
        question: '“Do I actually need to pay for a credential evaluation?”',
        lead: 'Many recipients only need one in specific situations. Confirm what your employer, school or board accepts before you spend money.',
        helps: ['Learn which situations usually require an official report', 'Draft a question to the organization that will receive it', 'Compare evaluation services listed by independent associations such as NACES'],
        bring: ['Who will receive the evaluation', 'Whether they need a course-by-course or document report'],
        limit: 'VerifED is not affiliated with NACES or any evaluation service and does not recommend one over another.',
        primary: { kind: 'route', href: '/guides/credential-evaluation-for-us-jobs', label: 'Guide: when you may need an evaluation' },
        secondary: { kind: 'external', href: 'https://www.naces.org/members', label: 'NACES member list' },
      },
      {
        id: 'licensing', title: 'Licensing Next Steps', short: 'Find the board that decides',
        question: '“Can I work in my profession here?”',
        lead: 'Regulated fields such as nursing, engineering, accounting and teaching are decided state by state. We point you to the authority that sets the rules.',
        helps: ['Identify whether your field is usually licensed', 'Find authoritative licensing sources for your profession', 'Prepare questions about exams, English testing and documents'],
        bring: ['Your profession and specialization', 'The state where you plan to work'],
        limit: 'Your profession and state determine the requirements, not this app. We cannot grant or predict licensure.',
        primary: { kind: 'route', href: '/how-it-works', label: 'See how the process works' },
        secondary: { kind: 'profile', label: 'Add your qualification' },
      },
      {
        id: 'jobs', title: 'Job Board Access', short: 'Search roles that fit your field',
        question: '“Where do I start applying?”',
        lead: 'After you add a qualification, the evaluator opens pre-filtered U.S. job searches for roles that commonly align with your field.',
        helps: ['Open live searches on major U.S. job boards', 'See role titles that commonly match your background', 'Present your foreign education clearly on applications'],
        bring: ['Your field of study', 'A city or region you are open to'],
        limit: 'Links open third-party job boards. Employers decide which credentials they accept.',
        primary: { kind: 'profile', label: 'Unlock field-matched searches' },
        secondary: { kind: 'route', href: '/guides/foreign-degree-on-resume', label: 'Guide: list your degree on a resume' },
      },
    ],
  },
  es: {
    eyebrow: 'En qué le ayuda VerifED', h: 'Elija la pregunta que tiene ahora mismo.',
    sub: 'Cada área explica lo que puede hacer aquí, qué tener listo y dónde termina nuestra orientación.',
    helps: 'Lo que puede hacer aquí', bring: 'Tenga listo', limit: 'Dónde termina', tablist: 'Servicios de VerifED', ext: '(abre un sitio externo)',
    services: [
      {
        id: 'education', title: 'Orientación Educativa', short: 'Entienda sus títulos en términos de EE. UU.',
        question: '“¿Cómo describo mi título a alguien en EE. UU.?”',
        lead: 'Registre cada titulación con su nombre original y lea contexto claro sobre términos educativos de EE. UU. con fuentes citadas.',
        helps: ['Agregue cada título por separado: diploma, grado, certificado profesional', 'Vea la terminología de EE. UU. explicada sin forzar una equivalencia', 'Descargue un expediente con todas sus titulaciones y preguntas pendientes'],
        bring: ['Nombre del título tal como aparece', 'Institución, país y años de estudio'],
        limit: 'Nunca asignamos una equivalencia oficial en EE. UU. Solo un evaluador reconocido o la institución receptora puede hacerlo.',
        primary: { kind: 'profile', label: 'Crear mi perfil' },
        secondary: { kind: 'route', href: '/guides/foreign-degree-on-resume', label: 'Guía: título extranjero en un currículum' },
      },
      {
        id: 'evaluation', title: 'Recursos de Evaluación', short: 'Sepa cuándo necesita una evaluación oficial',
        question: '“¿Realmente debo pagar una evaluación de credenciales?”',
        lead: 'Muchos destinatarios solo la piden en situaciones concretas. Confirme qué acepta su empleador, escuela o junta antes de pagar.',
        helps: ['Conozca qué situaciones suelen requerir un informe oficial', 'Redacte una pregunta para la organización que lo recibirá', 'Compare servicios listados por asociaciones independientes como NACES'],
        bring: ['Quién recibirá la evaluación', 'Si necesitan un informe curso por curso o de documento'],
        limit: 'VerifED no está afiliado a NACES ni a ningún servicio de evaluación y no recomienda uno sobre otro.',
        primary: { kind: 'route', href: '/guides/credential-evaluation-for-us-jobs', label: 'Guía: cuándo puede necesitar una evaluación' },
        secondary: { kind: 'external', href: 'https://www.naces.org/members', label: 'Lista de miembros de NACES' },
      },
      {
        id: 'licensing', title: 'Licencias: Próximos Pasos', short: 'Encuentre la junta que decide',
        question: '“¿Puedo ejercer mi profesión aquí?”',
        lead: 'Campos regulados como enfermería, ingeniería, contabilidad y docencia se deciden estado por estado. Le indicamos la autoridad que fija las reglas.',
        helps: ['Identifique si su campo suele requerir licencia', 'Encuentre fuentes oficiales de licencias para su profesión', 'Prepare preguntas sobre exámenes, inglés y documentos'],
        bring: ['Su profesión y especialidad', 'El estado donde planea trabajar'],
        limit: 'Su profesión y su estado determinan los requisitos, no esta aplicación. No otorgamos ni predecimos licencias.',
        primary: { kind: 'route', href: '/how-it-works', label: 'Vea cómo funciona el proceso' },
        secondary: { kind: 'profile', label: 'Agregar mi titulación' },
      },
      {
        id: 'jobs', title: 'Acceso a Bolsas de Empleo', short: 'Busque puestos acordes a su campo',
        question: '“¿Dónde empiezo a postularme?”',
        lead: 'Tras agregar una titulación, el evaluador abre búsquedas de empleo en EE. UU. prefiltradas para puestos afines a su campo.',
        helps: ['Abra búsquedas activas en las principales bolsas de EE. UU.', 'Vea títulos de puestos que suelen coincidir con su perfil', 'Presente su educación extranjera con claridad'],
        bring: ['Su campo de estudio', 'Una ciudad o región de interés'],
        limit: 'Los enlaces abren bolsas de empleo de terceros. Los empleadores deciden qué credenciales aceptan.',
        primary: { kind: 'profile', label: 'Desbloquear búsquedas por campo' },
        secondary: { kind: 'route', href: '/guides/foreign-degree-on-resume', label: 'Guía: su título en un currículum' },
      },
    ],
  },
};

const Arrow = () => (
  <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
);

export function ServiceExplorer({ lang, onStartProfile }: { lang: Lang; onStartProfile: () => void }) {
  const c = COPY[lang];
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const s = c.services[active];

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = c.services.length;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  function renderAction(a: Action, primary: boolean, testId: string) {
    const cls = primary ? 'vf-btn' : 'vf-btn-soft';
    if (a.kind === 'profile') return <button type="button" onClick={onStartProfile} className={cls} data-testid={testId}>{a.label}<Arrow /></button>;
    if (a.kind === 'external') return <a href={a.href} target="_blank" rel="noopener noreferrer" className={cls} data-testid={testId}>{a.label}<span className="sr-only"> {c.ext}</span><svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M9 7h8v8" /></svg></a>;
    return <Link href={a.href} className={cls} data-testid={testId}>{a.label}<Arrow /></Link>;
  }

  return (
    <section aria-labelledby="services-h" data-testid="section-services">
      <div className="mb-10 max-w-3xl">
        <p className="vf-eyebrow">{c.eyebrow}</p>
        <h2 id="services-h" className="mt-3 text-3xl sm:text-[44px] font-bold leading-tight text-[#0F172A]">{c.h}</h2>
        <p className="mt-4 text-lg leading-relaxed text-[#4B5568]">{c.sub}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div role="tablist" aria-label={c.tablist} aria-orientation="vertical" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0 snap-x">
          {c.services.map((sv, i) => {
            const on = i === active;
            return (
              <button
                key={sv.id}
                ref={(el) => { tabs.current[i] = el; }}
                role="tab"
                id={`svc-tab-${sv.id}`}
                aria-selected={on}
                aria-controls={`svc-panel-${sv.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
                data-testid={`tab-service-${sv.id}`}
                className={`vf-svc-tab group snap-start min-w-[240px] lg:min-w-0 text-left rounded-[24px] px-5 py-5 transition-colors ${on ? 'bg-[#0F172A] text-[#FCFCFF]' : 'bg-[#FFFFFE] border border-[#E2E4F3] text-[#0F172A] hover:border-[#5B4FE9]'}`}
              >
                <span className="flex items-center gap-4">
                  <span aria-hidden="true" className={`vf-display flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${on ? 'bg-[#5B4FE9] text-[#FCFCFF]' : 'bg-[#EEF0FF] text-[#3F35C2]'}`}>0{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-bold">{sv.title}</span>
                    <span className={`mt-0.5 block text-sm ${on ? 'text-[#C7CBFA]' : 'text-[#4B5568]'}`}>{sv.short}</span>
                  </span>
                  <span aria-hidden="true" className={`ml-auto hidden lg:block transition-transform ${on ? 'translate-x-0 text-[#A5B4FC]' : '-translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`}><Arrow /></span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          key={s.id}
          role="tabpanel"
          id={`svc-panel-${s.id}`}
          aria-labelledby={`svc-tab-${s.id}`}
          tabIndex={0}
          data-testid={`panel-service-${s.id}`}
          className="vf-svc-panel vf-card overflow-hidden"
        >
          <div className="bg-[#EEF0FF] px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-sm font-semibold text-[#3F35C2]">{s.question}</p>
            <h3 className="vf-display mt-3 text-[28px] sm:text-[36px] font-bold leading-[1.1] text-[#0F172A]">{s.title}</h3>
            <p className="mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-[#273449]">{s.lead}</p>
          </div>
          <div className="grid gap-8 px-6 py-8 sm:px-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[#4B5568]">{c.helps}</h4>
              <ul className="mt-4 space-y-3">
                {s.helps.map((h) => (
                  <li key={h} className="flex gap-3 text-[15px] leading-relaxed text-[#0F172A]">
                    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#5B4FE9] text-xs font-bold text-[#FCFCFF]">✓</span>{h}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[#4B5568]">{c.bring}</h4>
              <ul className="mt-4 space-y-2">
                {s.bring.map((b) => (
                  <li key={b} className="rounded-2xl border border-[#E2E4F3] bg-[#FAFAFF] px-4 py-3 text-sm font-medium text-[#273449]">{b}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mx-6 sm:mx-10 rounded-2xl border-l-4 border-[#5B4FE9] bg-[#FAFAFF] px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F35C2]">{c.limit}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#273449]">{s.limit}</p>
          </div>
          <div className="flex flex-wrap gap-3 px-6 py-8 sm:px-10">
            {renderAction(s.primary, true, `action-service-primary-${s.id}`)}
            {renderAction(s.secondary, false, `action-service-secondary-${s.id}`)}
          </div>
        </div>
      </div>
    </section>
  );
}
