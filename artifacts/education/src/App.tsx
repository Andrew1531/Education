import { useState, useEffect, createContext, useContext } from 'react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { hashPassword, verifyAndMigratePassword } from './auth';

const STORAGE_KEY  = 'ge_username';
const USERS_KEY    = 'ge_users';      // all registered accounts

interface StoredUser {
  username:  string;
  email:     string;
  password:  string;
  salt?:     string;  // PBKDF2 salt; absent on legacy SHA-256 or plain-text records
  createdAt: string;
}

// ─── Language Context & Translations ─────────────────────────────────────────

type Lang = 'en' | 'es';

const TX = {
  en: {
    about: 'About', howItWorks: 'How It Works', signOut: 'Sign Out',
    footerCopy: '© 2026 VerifED Global. All rights reserved.',
    footerTag: 'Engineered for international academic and professional transparency.',
    privacy: 'Privacy Policy', terms: 'Terms of Service', admin: 'Admin',
    poweredBy: 'Powered and engineered by',
    heroBadge: '2026 U.S. Credential Intelligence Platform',
    heroLine1: 'Your Foreign Education,',
    heroLine2: 'Understood in the U.S.',
    heroSub: 'VerifED Global maps your foreign credentials to U.S. equivalency standards, accredited evaluation agencies, licensing boards, and employment frameworks — before you spend a dollar on official evaluations.',
    stat1: '180+', stat1L: 'Countries Covered',
    stat2: 'NACES', stat2L: 'Agency Aligned',
    stat3: '< 2 min', stat3L: 'To Your Roadmap',
    f1t: 'Credential Mapping', f1d: 'See exactly how your foreign degree maps to U.S. equivalency standards, institution types, and academic frameworks.',
    f2t: 'NACES Agency Matching', f2d: 'Find the right accredited evaluation agency for your specific country, degree level, and end goal.',
    f3t: 'Licensing Roadmap', f3d: 'Get field-specific licensing and regulatory requirements for your U.S. career path, state by state.',
    f4t: 'Job Board Access', f4d: 'Direct links to U.S. job boards actively seeking internationally educated professionals in your field.',
    createAcc: 'Create Your Account', signInAcc: 'Sign In to Your Account',
    alreadyReg: 'Already registered? Sign In', needAcc: 'Need an account? Sign Up',
    formNote: 'Your information is kept strictly private and never shared with government agencies or third parties.',
    lUser: 'Username', lPass: 'Password', lEmail: 'Correspondence Email',
    pUser: 'e.g., alex_global26', pEmail: 'name@example.com',
    btnCreate: 'Create Account & Access Evaluator', btnSignIn: 'Sign In & Access Evaluator',
    backHome: 'Back to Home', goEval: 'Go to the Evaluator',
    howTitle: 'How VerifED Global Works',
    howSub: 'From your first question to your first U.S. job application — here is the complete process.',
    privTitle: 'Privacy Policy', termsTitle: 'Terms of Service',
  },
  es: {
    about: 'Acerca de', howItWorks: 'Cómo Funciona', signOut: 'Cerrar Sesión',
    footerCopy: '© 2026 VerifED Global. Todos los derechos reservados.',
    footerTag: 'Diseñado para la transparencia académica y profesional internacional.',
    privacy: 'Política de Privacidad', terms: 'Términos de Servicio', admin: 'Administrador',
    poweredBy: 'Desarrollado e impulsado por',
    heroBadge: 'Plataforma de Inteligencia de Credenciales EE.UU. 2026',
    heroLine1: 'Tu Educación Extranjera,',
    heroLine2: 'Reconocida en EE.UU.',
    heroSub: 'VerifED Global mapea tus credenciales extranjeras a los estándares de equivalencia de EE.UU., agencias evaluadoras acreditadas, juntas de licencias y marcos de empleo — antes de que gastes un centavo en evaluaciones oficiales.',
    stat1: '180+', stat1L: 'Países Cubiertos',
    stat2: 'NACES', stat2L: 'Agencias Acreditadas',
    stat3: '< 2 min', stat3L: 'Para Tu Hoja de Ruta',
    f1t: 'Mapeo de Credenciales', f1d: 'Ve exactamente cómo tu título extranjero se equipara con los estándares de equivalencia de EE.UU., tipos de instituciones y marcos académicos.',
    f2t: 'Agencias NACES', f2d: 'Encuentra la agencia evaluadora acreditada correcta para tu país, nivel de título y objetivo final.',
    f3t: 'Hoja de Ruta de Licencias', f3d: 'Obtén los requisitos de licencias específicos por campo para tu carrera en EE.UU., estado por estado.',
    f4t: 'Bolsas de Trabajo', f4d: 'Links directos a bolsas de trabajo de EE.UU. que buscan activamente profesionales educados internacionalmente en tu campo.',
    createAcc: 'Crear Tu Cuenta', signInAcc: 'Iniciar Sesión',
    alreadyReg: '¿Ya tienes cuenta? Inicia Sesión', needAcc: '¿Necesitas una cuenta? Regístrate',
    formNote: 'Tu información se mantiene estrictamente privada y nunca se comparte con agencias gubernamentales ni terceros.',
    lUser: 'Usuario', lPass: 'Contraseña', lEmail: 'Correo de Correspondencia',
    pUser: 'ej., alex_global26', pEmail: 'nombre@ejemplo.com',
    btnCreate: 'Crear Cuenta y Acceder al Evaluador', btnSignIn: 'Iniciar Sesión y Acceder al Evaluador',
    backHome: 'Volver al Inicio', goEval: 'Ir al Evaluador',
    howTitle: 'Cómo Funciona VerifED Global',
    howSub: 'Desde tu primera pregunta hasta tu primera solicitud de empleo en EE.UU. — aquí está el proceso completo.',
    privTitle: 'Política de Privacidad', termsTitle: 'Términos de Servicio',
  },
} as const;

type TKey = keyof typeof TX.en;
const LangCtx = createContext<{ lang: Lang; toggleLang: () => void; t: (k: TKey) => string }>({
  lang: 'en', toggleLang: () => {}, t: (k) => TX.en[k],
});
function useLang() { return useContext(LangCtx); }

/** Thrown when the `ge_users` localStorage entry exists but cannot be parsed. */
class UserStoreCorruptError extends Error {
  constructor(cause: unknown) {
    super(
      `User store (${USERS_KEY}) is corrupt and could not be read: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = 'UserStoreCorruptError';
  }
}

/** True when `v` has every required field of a StoredUser at the right type. */
function isValidStoredUser(v: unknown): v is StoredUser {
  if (!v || typeof v !== 'object') return false;
  const u = v as Record<string, unknown>;
  return (
    typeof u.username  === 'string' && u.username.length > 0 &&
    typeof u.email     === 'string' &&
    typeof u.password  === 'string' && u.password.length > 0 &&
    typeof u.createdAt === 'string'
  );
}

/**
 * Read all stored users.
 *
 * Returns `[]` only when the key is absent (genuine first-run state).
 * An empty string, non-array JSON, or any record that fails schema
 * validation all throw `UserStoreCorruptError` — callers must handle this
 * explicitly rather than treating it as "no users".
 */
function getUsers(): StoredUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (raw === null) return [];               // key absent → first-run, no data yet
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new UserStoreCorruptError('parsed value is not an array');
    }
    // Validate every record — a partially-written entry is still corrupt.
    const invalid = parsed.findIndex((item) => !isValidStoredUser(item));
    if (invalid !== -1) {
      throw new UserStoreCorruptError(
        `record at index ${invalid} is missing required fields (username, password, createdAt)`,
      );
    }
    return parsed as StoredUser[];
  } catch (e) {
    if (e instanceof UserStoreCorruptError) throw e;
    throw new UserStoreCorruptError(e);
  }
}

/**
 * Persist the user list.
 *
 * Performs a JSON round-trip check before writing so that a serialisation
 * failure is caught before it overwrites good data with a truncated value.
 */
function saveUsers(users: StoredUser[]) {
  let serialized: string;
  try {
    serialized = JSON.stringify(users);
    // Round-trip validation: confirm we can parse what we are about to write.
    const roundTripped: unknown = JSON.parse(serialized);
    if (!Array.isArray(roundTripped)) throw new Error('round-trip produced non-array');
  } catch (e) {
    throw new Error(
      `saveUsers: data failed round-trip validation and was NOT written. ` +
        (e instanceof Error ? e.message : String(e)),
    );
  }
  localStorage.setItem(USERS_KEY, serialized);
}


type AppView = 'auth' | 'app';

interface EvalResult {
  country: string;
  institution: string;
  degree: string;
  field: string;
  purpose: string;
  usLevel: string;
  insight: string;
  roadmap: { title: string; desc: string }[];
}

function getUsLevel(degree: string): string {
  const d = degree.toLowerCase();
  if (d.includes('master') || d.includes('postgraduate') || d.includes('pg')) return "U.S. Master's Degree";
  if (d.includes('doctor') || d.includes('phd')) return 'U.S. Doctoral Degree';
  if (d.includes('diploma') || d.includes('associate') || d.includes('hnd')) return 'U.S. Associate Degree / Diploma';
  return "Standard U.S. Bachelor's Degree";
}

function getInsight(field: string): string {
  const f = field.toLowerCase();
  if (f.includes('account') || f.includes('finance') || f.includes('audit')) {
    return `• CPA Licensure Pathway: Most U.S. state boards require 150 semester credit hours. Foreign accounting coursework is mapped course-by-course to satisfy specific accounting and business subject minimums.\n• Professional Competitiveness: Supplemental designations like CFA, CIA, or FMVA can strengthen your profile in corporate finance and investment banking.`;
  }
  if (f.includes('engineering') || f.includes('tech') || f.includes('computer')) {
    return `• Technical Equivalency: ABET-equivalent coursework mapping is standard for engineering degrees. Professional Engineer (PE) licensure requires passing the FE exam.\n• Industry Alignment: High recognition for international tech degrees; portfolios, GitHub activity, and cloud/security certifications carry substantial weight.`;
  }
  if (f.includes('nursing') || f.includes('health') || f.includes('medicine')) {
    return `• Healthcare Regulatory Requirements: Healthcare fields require state licensing board credential review, English language testing, and board examinations (such as the NCLEX).`;
  }
  return `• General Professional Recognition: Your credential aligns well with standard U.S. employment and admissions frameworks. Review specific institutional prerequisite checklists.`;
}

function getRoadmap(country: string, institution: string, field: string, purpose: string) {
  return [
    {
      title: `Crawl & Verify Institutional Credentials from ${institution || 'Foreign Institution'}`,
      desc: `Automated scrape of ${country || 'International'} Ministry of Education registries to verify accreditation status and active degree registry records.`,
    },
    {
      title: `Map Coursework to NACES-Accredited Standards`,
      desc: `Convert regional credit hours to U.S. semester credit units (SCU) matching standard undergraduate/graduate benchmarks for ${field || 'your field'}.`,
    },
    {
      title: `Align with ${purpose || 'General U.S. Employment/Admission'} Prerequisites`,
      desc: `Extract specific state board guidelines, GPA conversion rules, and prerequisite course minimums.`,
    },
    {
      title: `Export Official NACES Application Dossier`,
      desc: `Compile your scraped data packet into a standardized format ready for direct submission to WES, ECE, or Josef Silny & Associates.`,
    },
  ];
}

// ─── Storage Corrupt Banner ───────────────────────────────────────────────────

/**
 * Prominent warning shown when `ge_users` exists but cannot be parsed.
 * Gives the admin a clear path to recover (clear the key) or dismiss and
 * continue without user data.
 */
function StorageCorruptBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      data-testid="banner-storage-corrupt"
      className="relative z-50 mx-4 mt-4 rounded-2xl border border-red-500/50 bg-red-950/80 backdrop-blur-sm px-5 py-4 shadow-xl shadow-red-900/30"
    >
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-xl flex-shrink-0 mt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-red-300 font-bold text-sm mb-1">User store is unreadable — accounts may be inaccessible</p>
          <p className="text-red-400 text-xs leading-relaxed mb-3">
            The saved account data appears to be corrupted or malformed. Sign-in and registration are unavailable until this is resolved.
            An administrator can clear the corrupted data from the browser&apos;s Application → Local Storage tab
            (<code className="font-mono bg-red-900/40 px-1 rounded">ge_users</code>) to restore access.
          </p>
          <details className="group">
            <summary className="text-red-500 text-[11px] font-mono cursor-pointer hover:text-red-300 transition-colors select-none">
              Technical detail
            </summary>
            <p className="text-red-500 text-[11px] font-mono mt-1 break-all leading-relaxed">{message}</p>
          </details>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            data-testid="button-dismiss-storage-corrupt"
            aria-label="Dismiss warning"
            className="text-red-600 hover:text-red-400 transition-colors flex-shrink-0 bg-transparent border-none cursor-pointer text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Shared Shell ─────────────────────────────────────────────────────────────

function LangToggle() {
  const { lang, toggleLang } = useLang();
  return (
    <button
      onClick={toggleLang}
      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all cursor-pointer select-none"
      aria-label="Toggle language"
    >
      <span>{lang === 'en' ? '🇺🇸' : '🇲🇽'}</span>
      <span>{lang === 'en' ? 'EN' : 'ES'}</span>
      <span className="text-slate-600 font-normal">/</span>
      <span className="text-slate-500 font-normal">{lang === 'en' ? 'ES' : 'EN'}</span>
    </button>
  );
}

function Navbar({ appView, username, onLogout }: { appView: AppView; username: string; onLogout: () => void }) {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  return (
    <nav className="relative z-50 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <button
          onClick={() => setLocation('/')}
          className="flex items-center space-x-3 cursor-pointer bg-transparent border-none p-0"
          data-testid="link-home"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-500/30">
            VG
          </div>
          <div className="text-left">
            <span className="font-extrabold text-white text-lg tracking-tight block">VerifED Global</span>
            <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">2026 Credential Engine</span>
          </div>
        </button>

        <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-400">
          <Link href="/about" className="hover:text-white transition-colors" data-testid="link-about">{t('about')}</Link>
          <Link href="/how-it-works" className="hover:text-white transition-colors" data-testid="link-how-it-works">{t('howItWorks')}</Link>
          <LangToggle />
        </div>

        <div className="flex items-center gap-3">
          {/* Mobile lang toggle */}
          <div className="md:hidden"><LangToggle /></div>

          {appView === 'app' && (
            <div className="flex items-center space-x-3" data-testid="nav-user-badge">
              <span className="hidden sm:inline text-xs text-indigo-300 font-mono bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/30" data-testid="text-nav-username">
                👤 @{username}
              </span>
              <button
                onClick={onLogout}
                data-testid="button-signout"
                className="text-xs text-slate-400 hover:text-white transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full cursor-pointer"
              >
                {t('signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function Footer({ onPrivacy, onTerms }: { onPrivacy: () => void; onTerms: () => void }) {
  const { t } = useLang();
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-12 px-6 relative z-10 mt-20">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <p className="text-xs text-slate-400 font-medium">{t('footerCopy')}</p>
          <p className="text-[11px] text-slate-500 mt-1">{t('footerTag')}</p>
        </div>
        <div className="flex items-center space-x-6 text-xs text-slate-400 font-medium">
          <button onClick={onPrivacy} data-testid="button-privacy-policy" className="hover:text-white transition-colors cursor-pointer bg-transparent border-none text-slate-400 text-xs font-medium">{t('privacy')}</button>
          <button onClick={onTerms} data-testid="button-terms" className="hover:text-white transition-colors cursor-pointer bg-transparent border-none text-slate-400 text-xs font-medium">{t('terms')}</button>
          <Link href="/admin" className="hover:text-white transition-colors text-slate-600 text-xs font-medium" data-testid="link-admin">{t('admin')}</Link>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-inner">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">{t('poweredBy')}</span>
          <a href="https://ladmedia.co" target="_blank" rel="noopener noreferrer" data-testid="link-lad-media" className="text-xs font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent hover:underline">LAD MEDIA</a>
        </div>
      </div>
    </footer>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ id, title, children, onClose }: { id: string; title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" data-testid={`modal-${id}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel p-8 rounded-3xl max-w-lg w-full relative border border-slate-700 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
        <div className="text-xs text-slate-300 space-y-3 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">{children}</div>
        <button onClick={onClose} data-testid={`button-close-${id}`} className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-600/30">Close</button>
      </div>
    </div>
  );
}

// ─── About Page ───────────────────────────────────────────────────────────────

function AboutPage() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  return (
    <main className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 flex-grow w-full">
      {/* Back */}
      <button onClick={() => setLocation('/')} data-testid="button-back-about" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-10 bg-transparent border-none cursor-pointer">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        {t('backHome')}
      </button>

      {/* Hero */}
      <div className="mb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 mb-6 shadow-sm">
          <span className="text-indigo-400 font-semibold">🌍 Our Mission</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          Starting Over in a New Country{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Is One of the Hardest Things a Person Can Do.
          </span>
        </h1>
        <p className="text-slate-400 text-lg leading-relaxed">
          We know this — because the people who built VerifED Global have lived it, or watched someone they love go through it.
        </p>
      </div>

      {/* Story sections */}
      <div className="space-y-10">

        <div className="glass-panel p-8 rounded-3xl">
          <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-sm flex-shrink-0">01</span>
            The Journey Is Real — and It Is Hard
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-4">
            You spent years earning your education. You worked hard, you sacrificed, and you built something real. Then you arrived in the United States and were told it might not count here — or worse, you were given a dozen different answers from a dozen different people, none of them quite right.
          </p>
          <p className="text-slate-300 text-sm leading-relaxed">
            Moving to a new country means rebuilding everything. Your professional identity, your credentials, your career — sometimes even your confidence. The system is not designed to make that easy. And too many talented, qualified people lose years of their lives trying to navigate it alone.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-violet-500">
          <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-sm flex-shrink-0">02</span>
            The Advice Is Not Always Correct
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-4">
            One of the most painful parts of this process is that people will give you advice — friends, neighbors, even professionals — with complete confidence, and still be wrong. They will tell you your degree does not transfer when it does. They will point you to the wrong evaluation agency. They will underestimate what your credentials are worth, or send you down a path that costs you time and money you cannot afford to lose.
          </p>
          <p className="text-slate-300 text-sm leading-relaxed">
            This is not because people are malicious. It is because this system is genuinely complex, and the correct answer depends on your specific country, degree, field, and goal. Generic advice fails people every day.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-cyan-500">
          <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-sm flex-shrink-0">03</span>
            We Are Here to Help Guide You in the Right Direction
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-4">
            VerifED Global was built for one purpose: to give international individuals access to the kind of clear, specific, honest information that can actually move their situation forward. We do not claim to do everything. But we will do our absolute best to point you in the right direction.
          </p>
          <p className="text-slate-300 text-sm leading-relaxed mb-4">
            We map your credentials to U.S. equivalency standards, help you understand which evaluation agencies apply to your situation, surface the field-specific licensing and employment requirements you need to know, and connect you with the job boards where real opportunities are waiting.
          </p>
          <p className="text-slate-300 text-sm leading-relaxed">
            We cannot promise the road ahead will be short. But we can promise you will not be walking it without a map.
          </p>
        </div>

        {/* Values strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          {[
            { icon: '🤝', title: 'Honest Guidance', desc: 'We tell you what we know — and what we do not know. No false promises, no shortcuts.' },
            { icon: '🎯', title: 'Specific Answers', desc: 'Your country. Your degree. Your field. The right answer depends on all three.' },
            { icon: '🌱', title: 'Built for the Journey', desc: 'We are with you from your first question to your first U.S. job application.' },
          ].map((v) => (
            <div key={v.title} className="glass-panel p-6 rounded-2xl text-center">
              <div className="text-3xl mb-3">{v.icon}</div>
              <h3 className="text-white font-bold text-sm mb-2">{v.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="glass-panel p-8 rounded-3xl text-center">
          <p className="text-slate-300 text-sm leading-relaxed mb-6 max-w-xl mx-auto">
            Ready to find out how your credentials translate? Start with the evaluator — it takes less than two minutes and gives you a real picture of where you stand.
          </p>
          <button
            onClick={() => setLocation('/')}
            data-testid="button-go-to-evaluator"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 px-8 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer"
          >
            {t('goEval')}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </div>
      </div>
    </main>
  );
}

// ─── How It Works Page ────────────────────────────────────────────────────────

const HOW_STEPS = [
  {
    num: '01',
    icon: '📋',
    color: 'from-indigo-600 to-indigo-500',
    border: 'border-l-indigo-500',
    title: 'Create Your Account',
    desc: 'Sign up with a username and email. Your information stays private and secure — it is used only to save your progress and correspond with you about your evaluation.',
    detail: 'We keep your data strictly confidential. It is never shared with government agencies, employers, or third parties.',
  },
  {
    num: '02',
    icon: '📄',
    color: 'from-violet-600 to-violet-500',
    border: 'border-l-violet-500',
    title: 'Enter Your Credential Details',
    desc: 'Tell us your country of education, institution name, degree level, and field of study. The more detail you provide, the more specific your results will be.',
    detail: 'You can also note your primary goal — university admission, employment, professional licensing, or immigration — so we can tailor the roadmap to your path.',
  },
  {
    num: '03',
    icon: '🛰️',
    color: 'from-cyan-600 to-cyan-500',
    border: 'border-l-cyan-500',
    title: 'We Analyze Your Credentials',
    desc: 'Our platform maps your degree to its U.S. equivalent, identifies the relevant NACES evaluation agencies, and surfaces field-specific licensing and regulatory requirements.',
    detail: 'Results are generated instantly based on your inputs, giving you a clear starting point before you spend time or money on official evaluations.',
  },
  {
    num: '04',
    icon: '🗺️',
    color: 'from-emerald-600 to-emerald-500',
    border: 'border-l-emerald-500',
    title: 'Follow Your Personalized Roadmap',
    desc: 'You receive a step-by-step action plan: verify your institution, map your coursework, align with your goal\'s requirements, and prepare your NACES application dossier.',
    detail: 'Each step is checkable so you can track your progress as you move through the process.',
  },
  {
    num: '05',
    icon: '🤝',
    color: 'from-rose-600 to-rose-500',
    border: 'border-l-rose-500',
    title: 'Reach Out If You Need Help',
    desc: 'Stuck? Not sure which evaluation agency fits your situation? Our team is available to answer questions, review your specific case, and help you take the next step.',
    detail: 'Use the contact form on the main platform to send us a message. We respond within 24 hours.',
  },
  {
    num: '06',
    icon: '💼',
    color: 'from-orange-600 to-orange-500',
    border: 'border-l-orange-500',
    title: 'Start Applying for U.S. Jobs',
    desc: 'Once your credentials are evaluated, use our integrated job board links to search for positions in your field across Indeed, LinkedIn, Glassdoor, USAJobs, and more.',
    detail: 'Many U.S. employers actively recruit internationally educated professionals — your credential evaluation is the documentation that opens those doors.',
  },
];

function HowItWorksPage() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  return (
    <main className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 flex-grow w-full">
      {/* Back */}
      <button onClick={() => setLocation('/')} data-testid="button-back-how" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-10 bg-transparent border-none cursor-pointer">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        {t('backHome')}
      </button>

      {/* Hero */}
      <div className="mb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 mb-6 shadow-sm">
          <span className="text-indigo-400 font-semibold">⚡ Simple, Step-by-Step</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            {t('howTitle')}
          </span>
        </h1>
        <p className="text-slate-400 text-lg leading-relaxed max-w-2xl">
          {t('howSub')}
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {HOW_STEPS.map((step) => (
          <div key={step.num} className={`glass-panel p-8 rounded-3xl border-l-4 ${step.border}`} data-testid={`step-${step.num}`}>
            <div className="flex items-start gap-5">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-xl flex-shrink-0 shadow-lg`}>
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Step {step.num}</span>
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed mb-3">{step.desc}</p>
                <p className="text-slate-500 text-xs leading-relaxed italic border-l-2 border-slate-700 pl-3">{step.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* What you need section */}
      <div className="glass-panel p-8 rounded-3xl mt-10">
        <h2 className="text-white font-bold text-lg mb-6 flex items-center gap-3">
          <span className="text-indigo-400 text-xl">📦</span> What You Will Need to Get Started
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Official transcripts or diploma', note: 'Originals or certified copies from your institution' },
            { label: 'Institution name & country', note: 'Exactly as it appears on your documents' },
            { label: 'Degree title & field of study', note: 'Your specific major or specialization' },
            { label: 'Your U.S. goal', note: 'Employment, licensing, grad school, or immigration' },
            { label: 'Correspondence email', note: 'So we can follow up with additional guidance' },
            { label: 'Patience — and confidence', note: 'The process takes time, but it works' },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/60">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0 text-sm">✓</span>
              <div>
                <p className="text-white text-xs font-semibold mb-0.5">{item.label}</p>
                <p className="text-slate-500 text-xs">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="glass-panel p-8 rounded-3xl mt-6 text-center">
        <p className="text-slate-300 text-sm leading-relaxed mb-6 max-w-xl mx-auto">
          Ready to get started? The evaluator takes less than two minutes. Enter your details and we will generate your equivalency report and action roadmap instantly.
        </p>
        <button
          onClick={() => setLocation('/')}
          data-testid="button-go-to-evaluator-how"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 px-8 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer"
        >
          Go to the Evaluator
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </button>
      </div>
    </main>
  );
}

// ─── Auth View ────────────────────────────────────────────────────────────────

function AuthView({ onLogin, storageError }: { onLogin: (username: string) => void; storageError?: string }) {
  const { t } = useLang();
  const [isSignUp, setIsSignUp] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username || !password) return;

    let users: StoredUser[];
    try {
      users = getUsers();
    } catch (err) {
      setError(
        err instanceof UserStoreCorruptError
          ? 'Account data is corrupted and cannot be read. Please contact the administrator.'
          : 'Unable to load accounts. Please refresh and try again.',
      );
      return;
    }

    if (isSignUp) {
      if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
        setError('Username already taken. Please choose another or sign in.');
        return;
      }
      const { hash, salt } = await hashPassword(password);
      const newUser: StoredUser = {
        username,
        email: email || '',
        password: hash,
        salt,
        createdAt: new Date().toISOString(),
      };
      saveUsers([...users, newUser]);
    } else {
      const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        if (users.length === 0) {
          const { hash, salt } = await hashPassword(password);
          saveUsers([{ username, email: '', password: hash, salt, createdAt: new Date().toISOString() }]);
        } else {
          setError('Incorrect username or password.');
          return;
        }
      } else {
        const { valid, newHash, newSalt } = await verifyAndMigratePassword(user.password, password, user.salt);
        if (!valid) { setError('Incorrect username or password.'); return; }
        if (newHash && newSalt) {
          saveUsers(users.map((u) => u.username === user.username ? { ...u, password: newHash, salt: newSalt } : u));
        }
      }
    }

    localStorage.setItem(STORAGE_KEY, username);
    onLogin(username);
  }

  const iCls = 'w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

  return (
    <div className="space-y-24">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="text-center max-w-4xl mx-auto pt-6">
        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 font-semibold mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
          🛰️ {t('heroBadge')}
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.05]">
          {t('heroLine1')}<br />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            {t('heroLine2')}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-slate-400 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-14">
          {t('heroSub')}
        </p>

        {/* Stats strip */}
        <div className="inline-flex flex-col sm:flex-row items-center divide-y sm:divide-y-0 sm:divide-x divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-sm">
          {([
            [t('stat1'), t('stat1L')],
            [t('stat2'), t('stat2L')],
            [t('stat3'), t('stat3L')],
          ] as [string, string][]).map(([val, label]) => (
            <div key={label} className="px-8 py-4 text-center">
              <div className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">{val}</div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {([
          ['🗺️', t('f1t'), t('f1d'), 'border-indigo-500/20 hover:border-indigo-500/40'],
          ['🏛️', t('f2t'), t('f2d'), 'border-violet-500/20 hover:border-violet-500/40'],
          ['📋', t('f3t'), t('f3d'), 'border-cyan-500/20 hover:border-cyan-500/40'],
          ['💼', t('f4t'), t('f4d'), 'border-emerald-500/20 hover:border-emerald-500/40'],
        ] as [string, string, string, string][]).map(([icon, title, desc, border]) => (
          <div key={title} className={`group bg-slate-900/60 border ${border} rounded-2xl p-6 backdrop-blur-sm transition-all duration-200 hover:bg-slate-800/60`}>
            <span className="text-2xl mb-3 block">{icon}</span>
            <h3 className="text-white font-bold text-sm mb-1.5">{title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* ── Storage corruption warning ────────────────────────────────── */}
      {storageError && (
        <div className="max-w-md mx-auto">
          <StorageCorruptBanner message={storageError} />
        </div>
      )}

      {/* ── Auth Form ────────────────────────────────────────────────────── */}
      <div className="max-w-md mx-auto">
        {/* Section label */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">
            {isSignUp ? t('createAcc') : t('signInAcc')}
          </span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        <div className="glass-panel p-8 rounded-3xl relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500" />

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base tracking-tight" data-testid="text-auth-heading">
              {isSignUp ? t('createAcc') : t('signInAcc')}
            </h2>
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} data-testid="button-toggle-auth" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline bg-transparent border-none cursor-pointer whitespace-nowrap ml-3">
              {isSignUp ? t('alreadyReg') : t('needAcc')}
            </button>
          </div>

          <p className="text-xs text-slate-500 mb-5 leading-relaxed">{t('formNote')}</p>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-auth">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('lUser')}</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} data-testid="input-username" className={iCls} placeholder={t('pUser')} required />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('lPass')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" className={iCls} placeholder="••••••••••••" required />
            </div>
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('lEmail')}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" className={iCls} placeholder={t('pEmail')} required />
              </div>
            )}
            {error && (
              <p className="text-red-400 text-xs font-medium bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
            )}
            <button type="submit" data-testid="button-auth-submit" className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2">
              <span>{isSignUp ? t('btnCreate') : t('btnSignIn')}</span>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}

// ─── Job Boards ───────────────────────────────────────────────────────────────

const JOB_BOARDS = [
  { name: 'Indeed', url: 'https://www.indeed.com', desc: 'Search millions of U.S. jobs by title, location, and salary.', color: 'from-blue-600 to-blue-500', initials: 'In' },
  { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs', desc: 'Apply directly and connect with hiring managers.', color: 'from-sky-700 to-sky-500', initials: 'Li' },
  { name: 'Glassdoor', url: 'https://www.glassdoor.com/Job', desc: 'Jobs with salary insights and company reviews.', color: 'from-emerald-600 to-emerald-500', initials: 'Gd' },
  { name: 'ZipRecruiter', url: 'https://www.ziprecruiter.com', desc: 'AI-matched job recommendations sent to your inbox.', color: 'from-orange-600 to-orange-500', initials: 'Zr' },
  { name: 'USAJobs', url: 'https://www.usajobs.gov', desc: 'Official portal for U.S. federal government positions.', color: 'from-red-700 to-red-500', initials: 'US' },
  { name: 'Monster', url: 'https://www.monster.com', desc: 'Job postings across industries nationwide.', color: 'from-violet-600 to-violet-500', initials: 'Mo' },
];

function JobBoardsSection() {
  return (
    <div className="mt-16">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-indigo-400 text-2xl">💼</span>
          <h2 className="text-white font-extrabold text-2xl tracking-tight">Start Applying Now</h2>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
          Once you have your credential evaluation, use these job boards to find U.S. positions in your field. Many employers accept international credentials — your roadmap gives you the documentation they need.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {JOB_BOARDS.map((board) => (
          <a key={board.name} href={board.url} target="_blank" rel="noopener noreferrer" data-testid={`link-job-board-${board.name.toLowerCase().replace(/\s+/g, '-')}`} className="glass-panel p-5 rounded-2xl flex items-start gap-4 hover:border-indigo-500/40 transition-all group">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${board.color} flex items-center justify-center font-black text-white text-sm flex-shrink-0 shadow-lg`}>{board.initials}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-bold text-sm group-hover:text-indigo-300 transition-colors">{board.name}</span>
                <svg className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{board.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Contact Section ──────────────────────────────────────────────────────────

function ContactSection() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent('VerifED Global – Transfer Help Request');
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
    window.open(`mailto:support@verifedglobal.com?subject=${subject}&body=${body}`, '_blank');
    setSent(true);
    setTimeout(() => setSent(false), 5000);
  }

  return (
    <div className="mt-12">
      <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-indigo-400 text-2xl">🤝</span>
              <h2 className="text-white font-extrabold text-2xl tracking-tight">Need Help Getting Started?</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Not sure where to begin with your credential transfer? Our team can walk you through the NACES evaluation process, help you choose the right agency, and answer questions about your specific field and country.
            </p>
            <ul className="space-y-3">
              {[
                'Guidance on choosing WES, ECE, or other evaluators',
                'Help gathering documents from your home country',
                'Advice on field-specific U.S. licensing requirements',
                'Support navigating USCIS credential recognition',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs text-slate-300">
                  <span className="text-indigo-400 mt-0.5 flex-shrink-0">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            {sent ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl mb-4">✅</div>
                <p className="text-white font-bold text-lg mb-1">Message Ready to Send</p>
                <p className="text-slate-400 text-sm">Your email client should have opened. We'll get back to you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-contact">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Your Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-contact-name" required placeholder="Full name" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Email Address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-contact-email" required placeholder="name@example.com" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">How Can We Help?</label>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} data-testid="input-contact-message" required rows={4} placeholder="Describe your credential, country, field, and what you're trying to achieve in the U.S. ..." className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none" />
                </div>
                <button type="submit" data-testid="button-contact-submit" className="w-full bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2">
                  <span>Send Message</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Evaluator View ───────────────────────────────────────────────────────────

// ─── Step content generators ──────────────────────────────────────────────────

function getVerifyContent(institution: string, country: string, degree: string) {
  return {
    status: 'Accreditation Confirmed',
    rows: [
      { label: 'Institution', value: institution },
      { label: 'Country', value: country },
      { label: 'Degree Recorded', value: degree },
      { label: 'Registry Source', value: `${country} Ministry of Education – Active Registry` },
      { label: 'Recognition Status', value: 'Recognized by NACES-member agencies' },
      { label: 'WES Eligibility', value: 'Eligible for World Education Services evaluation' },
      { label: 'ECE Eligibility', value: 'Eligible for Educational Credential Evaluators review' },
    ],
    action: { label: 'Verify on WES Registry', url: 'https://www.wes.org/about-credential-evaluations/the-evaluation-process/' },
  };
}

function getCourseworkContent(field: string, credits: string) {
  const f = field.toLowerCase();
  let rows: { regional: string; usSCU: string; notes: string }[] = [];
  if (f.includes('account') || f.includes('finance')) {
    rows = [
      { regional: 'Financial Accounting I & II', usSCU: '6 SCU', notes: 'Matches AACSB benchmark' },
      { regional: 'Cost & Managerial Accounting', usSCU: '3 SCU', notes: 'Required for CPA pathway' },
      { regional: 'Auditing & Assurance', usSCU: '3 SCU', notes: 'State board minimum' },
      { regional: 'Taxation (Domestic/International)', usSCU: '3 SCU', notes: 'Maps to U.S. tax law elective' },
      { regional: 'Business Law', usSCU: '3 SCU', notes: 'Required for 150-hour CPA rule' },
      { regional: 'Economics (Micro + Macro)', usSCU: '6 SCU', notes: 'Core business requirement' },
    ];
  } else if (f.includes('engineer') || f.includes('tech') || f.includes('computer')) {
    rows = [
      { regional: 'Calculus I–III', usSCU: '9 SCU', notes: 'ABET math foundation' },
      { regional: 'Physics I & II', usSCU: '8 SCU', notes: 'Lab credits included' },
      { regional: 'Core Engineering / CS Courses', usSCU: '30–36 SCU', notes: 'Major-specific mapping' },
      { regional: 'Capstone / Thesis', usSCU: '6 SCU', notes: 'Counts toward senior design' },
    ];
  } else if (f.includes('nurs') || f.includes('health') || f.includes('medic')) {
    rows = [
      { regional: 'Anatomy & Physiology', usSCU: '8 SCU', notes: 'With lab' },
      { regional: 'Pharmacology', usSCU: '3 SCU', notes: 'Clinical requirement' },
      { regional: 'Nursing Theory & Practice', usSCU: '18–24 SCU', notes: 'NCLEX prerequisite' },
      { regional: 'Clinical Hours', usSCU: '500+ hrs', notes: 'State board minimum varies' },
    ];
  } else {
    rows = [
      { regional: 'Core Major Courses', usSCU: '30–36 SCU', notes: 'Subject to course-by-course review' },
      { regional: 'General Education', usSCU: '30 SCU', notes: 'English, Math, Sciences, Humanities' },
      { regional: 'Electives', usSCU: '12–18 SCU', notes: 'Institutional electives' },
      { regional: 'Thesis / Capstone', usSCU: '3–6 SCU', notes: 'If applicable' },
    ];
  }
  const totalSCU = credits ? `Estimated from ${credits}` : 'Estimated 120–130 SCU total';
  return { rows, totalSCU };
}

function getPrereqContent(field: string, purpose: string) {
  const f = field.toLowerCase();
  const p = purpose.toLowerCase();
  const items: { label: string; value: string; link?: string }[] = [];

  if (f.includes('account') || f.includes('finance')) {
    items.push(
      { label: 'CPA Credit Requirement', value: '150 semester credit hours (most states)' },
      { label: 'GPA Conversion', value: 'Foreign GPA converted via WES GPA calculator; typically 2.5+ U.S. equivalent required' },
      { label: 'Accounting Hours Minimum', value: '24–30 SCU in accounting subjects' },
      { label: 'Business Hours Minimum', value: '24 SCU in general business' },
      { label: 'State Board Link', value: 'NASBA – National Association of State Boards of Accountancy', link: 'https://nasba.org/licensure/applyforalicense/' },
    );
  } else if (f.includes('engineer') || f.includes('tech') || f.includes('computer')) {
    items.push(
      { label: 'FE Exam Eligibility', value: 'Credential evaluation required before sitting for NCEES FE exam' },
      { label: 'GPA Minimum', value: '2.0 U.S. equivalent on 4.0 scale (varies by state board)' },
      { label: 'ABET Review', value: 'Non-ABET programs evaluated course-by-course; deficiencies may require additional coursework' },
      { label: 'PE Licensing Board', value: 'NCEES – National Council of Examiners for Engineering', link: 'https://ncees.org/engineering/fe/' },
    );
  } else if (f.includes('nurs') || f.includes('health') || f.includes('medic')) {
    items.push(
      { label: 'CGFNS Certification', value: 'Required for international nurses before NCLEX' },
      { label: 'English Proficiency', value: 'TOEFL iBT 83+ or IELTS 6.5+ typically required' },
      { label: 'Clinical Hours Verification', value: 'State board reviews clinical logs from home country program' },
      { label: 'NCLEX Board', value: 'NCSBN – National Council of State Boards of Nursing', link: 'https://www.ncsbn.org/nclex.htm' },
    );
  } else {
    items.push(
      { label: 'GPA Conversion', value: 'Convert via WES iGPA Calculator; 3.0+ U.S. recommended for graduate programs' },
      { label: 'English Proficiency', value: 'TOEFL or IELTS may be required for admission or licensing' },
      { label: 'Credential Evaluation', value: 'NACES-member agency evaluation letter required for most employers and schools' },
    );
  }

  if (p.includes('immigration')) {
    items.push({ label: 'USCIS Recognition', value: 'Form I-140 or EB-2/EB-3 petition may require credential evaluation letter', link: 'https://www.uscis.gov/working-in-the-united-states' });
  }
  if (p.includes('university')) {
    items.push({ label: 'Graduate Admissions', value: 'Most U.S. graduate programs require official NACES evaluation + certified translations' });
  }

  return items;
}

function exportDossier(result: EvalResult, verifyRows: { label: string; value: string }[], prereqItems: { label: string; value: string }[]) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>VerifED Global – NACES Dossier</title>
<style>
  body { font-family: Georgia, serif; max-width: 780px; margin: 40px auto; padding: 0 30px; color: #1a1a2e; line-height: 1.6; }
  .header { border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 32px; }
  .logo { font-size: 24px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; }
  .subtitle { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 2px; margin-top: 2px; }
  .ref { font-size: 11px; color: #9ca3af; float: right; margin-top: -40px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #4f46e5; margin: 28px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td { padding: 8px 10px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
  td:first-child { font-weight: 600; color: #374151; width: 42%; }
  td:last-child { color: #1f2937; }
  .badge { display: inline-block; background: #ede9fe; color: #5b21b6; border-radius: 20px; padding: 4px 14px; font-size: 12px; font-weight: 700; margin: 4px 4px 4px 0; }
  .notice { font-size: 11px; color: #6b7280; margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #9ca3af; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">VerifED Global</div>
  <div class="subtitle">2026 Credential Engine — NACES Application Dossier</div>
  <div class="ref">Generated: ${today}<br/>REF-2026-US</div>
</div>

<h2>Credential Summary</h2>
<table>
  <tr><td>Applicant Institution</td><td>${result.institution}</td></tr>
  <tr><td>Country of Education</td><td>${result.country}</td></tr>
  <tr><td>Degree Level</td><td>${result.degree}</td></tr>
  <tr><td>Field of Study</td><td>${result.field}</td></tr>
  <tr><td>U.S. Equivalent</td><td><strong>${result.usLevel}</strong></td></tr>
  ${result.purpose ? `<tr><td>Primary Goal</td><td>${result.purpose}</td></tr>` : ''}
</table>

<h2>Institutional Verification</h2>
<table>
  ${verifyRows.map(r => `<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join('')}
</table>

<h2>Recommended NACES Agencies</h2>
<table>
  <tr><td>World Education Services (WES)</td><td><a href="https://www.wes.org">wes.org</a></td></tr>
  <tr><td>Educational Credential Evaluators (ECE)</td><td><a href="https://www.ece.org">ece.org</a></td></tr>
  <tr><td>Josef Silny &amp; Associates</td><td><a href="https://www.jsilny.org">jsilny.org</a></td></tr>
  <tr><td>SpanTran</td><td><a href="https://spantran.com">spantran.com</a></td></tr>
</table>

<h2>U.S. Regulatory Pathway Notes</h2>
<table>
  ${prereqItems.map(r => `<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join('')}
</table>

<h2>Regulatory Insight</h2>
<p style="font-size:13px; color:#374151;">${result.insight.replace(/\n/g, '<br/>')}</p>

<h2>Credential Tags</h2>
<div>
  <span class="badge">🎓 ${result.usLevel}</span>
  <span class="badge">📚 ${result.field}</span>
  <span class="badge">📍 ${result.country}</span>
  ${result.purpose ? `<span class="badge">🎯 ${result.purpose}</span>` : ''}
</div>

<p class="notice">
  <strong>Disclaimer:</strong> This dossier is generated by VerifED Global for preliminary guidance only. It does not constitute an official NACES-accredited credential evaluation. 
  For official recognition, submit your documents to a NACES-member agency listed above. VerifED Global is a private, independent platform not affiliated with any government body.
</p>

<div class="footer">© 2026 VerifED Global. Engineered by LAD MEDIA. All rights reserved.</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `VerifED-Global-Dossier-${result.institution.replace(/\s+/g, '-')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Evaluator View ───────────────────────────────────────────────────────────

function EvaluatorView() {
  const [country, setCountry] = useState('');
  const [institution, setInstitution] = useState('');
  const [degree, setDegree] = useState('');
  const [field, setField] = useState('');
  const [credits, setCredits] = useState('');
  const [purpose, setPurpose] = useState('');
  const [result, setResult] = useState<EvalResult | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([false, false, false, false]);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const usLevel = getUsLevel(degree);
    const insight = getInsight(field);
    const roadmap = getRoadmap(country, institution, field, purpose);
    setResult({ country, institution, degree, field, purpose, usLevel, insight, roadmap });
    setCheckedSteps([false, false, false, false]);
    setExpandedStep(null);
    setDownloaded(false);
    if (window.innerWidth < 1024) {
      setTimeout(() => { document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    }
  }

  function toggleStep(i: number) {
    const next = !checkedSteps[i];
    setCheckedSteps((prev) => prev.map((v, idx) => (idx === i ? next : v)));
    setExpandedStep(next ? i : (expandedStep === i ? null : expandedStep));
  }

  return (
    <div>
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 mb-6 shadow-sm">
          <span className="text-indigo-400 font-semibold">⚡ Unified Platform Scraper:</span> Pulling real-time NACES, USCIS &amp; State Board frameworks.
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          Transform Your Foreign Education Into{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">U.S. Equivalency</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-normal leading-relaxed">
          Instantly crawl academic databases, map international coursework to U.S. standards, and generate a dynamic verification roadmap.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Input Card */}
        <section className="lg:col-span-5">
          <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg tracking-tight">Credential Parameters</h2>
              <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">STEP 1 OF 2</span>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5" data-testid="form-eval">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Country of Education</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} data-testid="input-country" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g., India, Nigeria, Brazil, UK" required />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Institution Name</label>
                <input value={institution} onChange={(e) => setInstitution(e.target.value)} data-testid="input-institution" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g., University of Lagos" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Degree Level</label>
                  <input value={degree} onChange={(e) => setDegree(e.target.value)} data-testid="input-degree" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g., B.Sc, M.Eng, MBBS" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Field of Study</label>
                  <input value={field} onChange={(e) => setField(e.target.value)} data-testid="input-field" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g., Accounting, Computer Science" required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Credits / Years <span className="text-slate-500 font-normal">(Opt)</span></label>
                  <input value={credits} onChange={(e) => setCredits(e.target.value)} data-testid="input-credits" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g., 4 Years / 180 ECTS" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Primary Goal</label>
                  <select value={purpose} onChange={(e) => setPurpose(e.target.value)} data-testid="select-purpose" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all">
                    <option value="">Select goal...</option>
                    <option value="University Admission">University Admission</option>
                    <option value="Employment & HR">Employment / HR</option>
                    <option value="Professional Licensing">Professional Licensing</option>
                    <option value="Immigration (USCIS)">Immigration (USCIS)</option>
                  </select>
                </div>
              </div>
              <button type="submit" data-testid="button-eval-submit" className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2">
                <span>Crawl &amp; Generate Equivalency Report</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </form>
          </div>
        </section>

        {/* Results Column */}
        <section className="lg:col-span-7" id="results-section">
          {result ? (
            <div className="space-y-6" data-testid="results-container">
              <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-indigo-500 relative overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Platform Crawl Complete
                  </span>
                  <span className="text-xs text-slate-400 font-mono bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">REF-2026-US</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-white leading-snug mb-6" data-testid="text-summary">
                  Your education from {result.institution} ({result.country}) in {result.field} evaluates equivalently to a {result.usLevel}.
                </div>
                <div className="flex flex-wrap gap-2.5 pt-4 border-t border-slate-800/80" data-testid="badges-container">
                  <span className="px-3.5 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-bold">🎓 {result.usLevel}</span>
                  <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-bold">📚 {result.field}</span>
                  <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-bold">📍 {result.country}</span>
                  {result.purpose && <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-bold">🎯 {result.purpose}</span>}
                </div>
              </div>

              <div className="glass-panel p-8 rounded-3xl" data-testid="insight-card">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="text-indigo-400 mr-2 text-lg">📊</span> Industry Regulatory Pathway
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line" data-testid="text-insight">{result.insight}</p>
              </div>

              <div className="glass-panel p-8 rounded-3xl relative overflow-hidden" data-testid="roadmap-section">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider flex items-center">
                    <span className="text-indigo-400 mr-2 text-lg">🛰️</span> Scraped Platform Action Roadmap
                  </h3>
                  <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Synced</span>
                </div>
                <p className="text-xs text-slate-400 mb-6">Check each step to expand its action details and track your progress through the evaluation process:</p>

                {(() => {
                  const verifyContent = getVerifyContent(result.institution, result.country, result.degree);
                  const courseworkContent = getCourseworkContent(result.field, result.field);
                  const prereqContent = getPrereqContent(result.field, result.purpose);

                  const steps = [
                    {
                      title: result.roadmap[0].title,
                      desc: result.roadmap[0].desc,
                      icon: '🔍',
                      content: (
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400">{verifyContent.status}</span>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              {verifyContent.rows.map((row) => (
                                <tr key={row.label} className="border-b border-slate-800/60">
                                  <td className="py-2 pr-4 text-slate-400 font-semibold w-2/5">{row.label}</td>
                                  <td className="py-2 text-slate-200">{row.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <a href={verifyContent.action.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
                            {verifyContent.action.label} →
                          </a>
                        </div>
                      ),
                    },
                    {
                      title: result.roadmap[1].title,
                      desc: result.roadmap[1].desc,
                      icon: '📐',
                      content: (
                        <div className="mt-4">
                          <p className="text-xs text-slate-400 mb-3">{courseworkContent.totalSCU}</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-700">
                                <th className="text-left py-2 pr-3 text-slate-400 font-semibold">Subject / Course Block</th>
                                <th className="text-left py-2 pr-3 text-indigo-400 font-semibold">U.S. SCU</th>
                                <th className="text-left py-2 text-slate-400 font-semibold hidden sm:table-cell">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {courseworkContent.rows.map((row) => (
                                <tr key={row.regional} className="border-b border-slate-800/60">
                                  <td className="py-2 pr-3 text-slate-200">{row.regional}</td>
                                  <td className="py-2 pr-3 font-bold text-indigo-300">{row.usSCU}</td>
                                  <td className="py-2 text-slate-500 hidden sm:table-cell">{row.notes}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <a href="https://www.naces.org/members" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
                            View all NACES member agencies →
                          </a>
                        </div>
                      ),
                    },
                    {
                      title: result.roadmap[2].title,
                      desc: result.roadmap[2].desc,
                      icon: '⚖️',
                      content: (
                        <div className="mt-4 space-y-2">
                          {prereqContent.map((item) => (
                            <div key={item.label} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 border-b border-slate-800/60">
                              <span className="text-xs font-semibold text-slate-400 w-full sm:w-2/5 flex-shrink-0">{item.label}</span>
                              <span className="text-xs text-slate-200 flex-1">
                                {item.link ? (
                                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{item.value} →</a>
                                ) : item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      ),
                    },
                    {
                      title: result.roadmap[3].title,
                      desc: result.roadmap[3].desc,
                      icon: '📦',
                      content: (
                        <div className="mt-4">
                          <p className="text-xs text-slate-300 leading-relaxed mb-4">
                            Your dossier is compiled from the information you provided and the data pulled across all steps above. It includes your credential summary, institutional verification, NACES agency recommendations, U.S. regulatory requirements, and your equivalency tags — formatted and ready to accompany your official evaluation application.
                          </p>
                          <div className="grid grid-cols-2 gap-2 mb-5">
                            {['Credential Summary', 'Institutional Verification', 'NACES Agency List', 'Regulatory Pathway', 'U.S. Equivalency Tags', 'Compliance Disclaimer'].map((item) => (
                              <div key={item} className="flex items-center gap-2 text-xs text-slate-300">
                                <span className="text-emerald-400 flex-shrink-0">✓</span> {item}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => { exportDossier(result, verifyContent.rows, prereqContent); setDownloaded(true); }}
                            data-testid="button-export-dossier"
                            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                          >
                            {downloaded ? (
                              <><span>✓ Dossier Downloaded</span></>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span>Download NACES Application Dossier</span>
                              </>
                            )}
                          </button>
                          {downloaded && <p className="text-xs text-slate-400 text-center mt-2">Open the downloaded file in your browser to print or save as PDF.</p>}
                        </div>
                      ),
                    },
                  ];

                  return (
                    <div className="space-y-3">
                      {steps.map((step, idx) => (
                        <div key={idx} data-testid={`roadmap-step-${idx}`} className={`rounded-2xl border transition-all ${checkedSteps[idx] ? 'bg-indigo-500/5 border-indigo-500/40' : 'bg-slate-900/70 border-slate-800/80'}`}>
                          <button
                            type="button"
                            onClick={() => toggleStep(idx)}
                            className="w-full flex items-start gap-3.5 p-4 text-left cursor-pointer"
                          >
                            <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${checkedSteps[idx] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-transparent'}`}>
                              {checkedSteps[idx] && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm">{step.icon}</span>
                                <strong className={`text-xs md:text-sm font-bold transition-colors ${checkedSteps[idx] ? 'text-indigo-300' : 'text-white'}`}>{idx + 1}. {step.title}</strong>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                            </div>
                            <svg className={`w-4 h-4 text-slate-500 flex-shrink-0 mt-1 transition-transform ${checkedSteps[idx] ? 'rotate-180 text-indigo-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {checkedSteps[idx] && (
                            <div className="px-4 pb-5 border-t border-indigo-500/20">
                              {step.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-16 text-center rounded-3xl flex flex-col items-center justify-center min-h-[500px] border-dashed border-2 border-slate-800/80" data-testid="placeholder-state">
              <div className="w-20 h-20 rounded-2xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-center text-3xl text-indigo-400 mb-6 shadow-xl scraper-pulse">🛰️</div>
              <h3 className="font-bold text-white text-xl mb-2">Platform Scraper Awaiting Input</h3>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">Fill out your academic parameters on the left to trigger real-time database crawling and build your roadmap.</p>
            </div>
          )}
        </section>
      </div>

      <ContactSection />
      <JobBoardsSection />
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

function AdminPage() {
  const [users, setUsers]             = useState<StoredUser[]>([]);
  const [storageErr, setStorageErr]   = useState<string>('');
  const [search, setSearch]           = useState('');
  const [resetTarget, setResetTarget] = useState<StoredUser | null>(null);
  const [newPass, setNewPass]         = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [resetMsg, setResetMsg]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StoredUser | null>(null);

  useEffect(() => {
    try { setUsers(getUsers()); }
    catch (e) { setStorageErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  function refresh() {
    try { setUsers(getUsers()); setStorageErr(''); }
    catch (e) { setStorageErr(e instanceof Error ? e.message : String(e)); }
  }

  async function handleResetPassword() {
    setResetMsg('');
    if (!newPass) { setResetMsg('Password cannot be empty.'); return; }
    if (newPass !== newPassConfirm) { setResetMsg('Passwords do not match.'); return; }
    if (!resetTarget) return;
    const { hash, salt } = await hashPassword(newPass);
    let current: StoredUser[];
    try { current = getUsers(); }
    catch (e) { setResetMsg(e instanceof Error ? e.message : String(e)); return; }
    const updated = current.map((u) =>
      u.username === resetTarget.username ? { ...u, password: hash, salt } : u,
    );
    saveUsers(updated);
    setUsers(updated);
    setResetMsg('✓ Password updated successfully.');
    setNewPass(''); setNewPassConfirm('');
    setTimeout(() => { setResetTarget(null); setResetMsg(''); }, 1500);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    let current: StoredUser[];
    try { current = getUsers(); }
    catch (e) {
      setStorageErr(e instanceof Error ? e.message : String(e));
      setDeleteTarget(null);
      return;
    }
    const updated = current.filter((u) => u.username !== deleteTarget.username);
    saveUsers(updated);
    // Log out the deleted user if they're currently logged in
    if (localStorage.getItem(STORAGE_KEY) === deleteTarget.username) {
      localStorage.removeItem(STORAGE_KEY);
    }
    setUsers(updated);
    setDeleteTarget(null);
  }

  function exportCSV() {
    const rows = [['Username', 'Email', 'Joined']];
    try { getUsers().forEach((u) => rows.push([u.username, u.email, new Date(u.createdAt).toLocaleDateString()])); }
    catch { /* corrupt — export whatever we already loaded into state */ users.forEach((u) => rows.push([u.username, u.email, new Date(u.createdAt).toLocaleDateString()])); }
    const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'verifed-users.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const inputCls = 'w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

  return (
    <main className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-24 flex-grow w-full">
      {/* Storage corruption warning */}
      {storageErr && <StorageCorruptBanner message={storageErr} onDismiss={() => setStorageErr('')} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-900/60 border border-rose-700/50 flex items-center justify-center text-lg">🔐</div>
          <div>
            <h1 className="text-white font-extrabold text-2xl tracking-tight">Admin Dashboard</h1>
            <p className="text-slate-400 text-xs">{users.length} registered account{users.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCSV} className="text-xs px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer font-medium">⬇ Export CSV</button>
          <button onClick={refresh} className="text-xs px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer font-medium">↻ Refresh</button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
          placeholder="Search by username or email…"
        />
      </div>

      {/* User table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-sm">
            {users.length === 0 ? 'No users have registered yet.' : 'No results match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Username</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Email</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Joined</th>
                  <th className="text-right px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, idx) => (
                  <tr key={user.username} className={`border-b border-slate-800/60 ${idx % 2 === 0 ? 'bg-slate-900/20' : ''} hover:bg-slate-800/30 transition-colors`}>
                    <td className="px-6 py-4">
                      <span className="font-mono text-indigo-300 text-xs bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-md">@{user.username}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 text-xs">{user.email || <span className="text-slate-600 italic">not provided</span>}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setResetTarget(user); setNewPass(''); setNewPassConfirm(''); setResetMsg(''); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-700/50 text-indigo-300 hover:text-white transition-all cursor-pointer font-medium"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => setDeleteTarget(user)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 text-red-400 hover:text-red-200 transition-all cursor-pointer font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button onClick={refresh} className="mt-4 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer bg-transparent border-none">↻ Refresh list</button>

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass-panel p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
            <h3 className="text-white font-bold text-lg mb-1">Reset Password</h3>
            <p className="text-slate-400 text-xs mb-6">Setting new password for <span className="text-indigo-300 font-mono">@{resetTarget.username}</span></p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">New Password</label>
                <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className={inputCls} placeholder="Min. 6 characters" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Confirm New Password</label>
                <input type="password" value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()} className={inputCls} placeholder="Repeat password" />
              </div>
              {resetMsg && <p className={`text-xs ${resetMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{resetMsg}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={handleResetPassword} className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 rounded-xl text-sm transition-all cursor-pointer">Update Password</button>
                <button onClick={() => { setResetTarget(null); setResetMsg(''); }} className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-all cursor-pointer border border-slate-700">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass-panel p-8 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-rose-500" />
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-white font-bold text-lg mb-2">Delete Account?</h3>
              <p className="text-slate-400 text-sm mb-6">
                This will permanently delete <span className="text-red-400 font-mono">@{deleteTarget.username}</span> and all their data. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl text-sm transition-all cursor-pointer">Yes, Delete</button>
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-all cursor-pointer border border-slate-700">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [appView, setAppView] = useState<AppView>('auth');
  const [username, setUsername] = useState('');
  const [modal, setModal] = useState<'privacy' | 'terms' | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  /** Non-empty when `ge_users` exists but cannot be parsed. */
  const [userStoreError, setUserStoreError] = useState<string>('');

  const toggleLang = () => setLang((l) => (l === 'en' ? 'es' : 'en'));
  const t = (k: TKey) => TX[lang][k];

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { setUsername(saved); setAppView('app'); }

    // Eagerly detect a corrupted user store so we can surface a warning
    // before the user tries (and fails) to sign in.
    try { getUsers(); }
    catch (e) { setUserStoreError(e instanceof Error ? e.message : String(e)); }
  }, []);

  function handleLogin(user: string) {
    setUsername(user); setAppView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setUsername(''); setAppView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <LangCtx.Provider value={{ lang, toggleLang, t }}>
    <WouterRouter base={base}>
      <div className="bg-slate-950 text-slate-100 min-h-screen font-sans relative overflow-x-hidden flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
        <div className="glow-effect -top-40 -left-40 rounded-full" />
        <div className="glow-effect top-1/3 -right-40 rounded-full" />

        <Navbar appView={appView} username={username} onLogout={handleLogout} />

        {/* Global storage-corruption banner — shown above all routes */}
        {userStoreError && (
          <StorageCorruptBanner
            message={userStoreError}
            onDismiss={() => setUserStoreError('')}
          />
        )}

        <Switch>
          <Route path="/about">
            <AboutPage />
          </Route>
          <Route path="/how-it-works">
            <HowItWorksPage />
          </Route>
          <Route path="/admin">
            <AdminPage />
          </Route>
          <Route>
            <main className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 flex-grow w-full">
              {appView === 'auth' ? <AuthView onLogin={handleLogin} storageError={userStoreError} /> : <EvaluatorView />}
            </main>
          </Route>
        </Switch>

        <Footer onPrivacy={() => setModal('privacy')} onTerms={() => setModal('terms')} />

        {modal === 'privacy' && (
          <Modal id="privacy" title="Privacy Policy" onClose={() => setModal(null)}>
            <p><strong>Strict Privacy &amp; Independence Notice:</strong> VerifED Global is a private, separate, and independent commercial company designed strictly to help international individuals navigate their educational and professional experience in the United States.</p>
            <p><strong>Basic Information &amp; Purpose:</strong> We collect basic account credentials (username, password, and correspondence email) solely to keep records and properly correspond with you regarding your credential evaluation roadmap.</p>
            <p><strong>Zero Data Selling &amp; Absolute Government Protection:</strong> <strong>We will never sell your information, nor will we ever hand over, share, or disclose any user data, personal records, or search inputs to any government agencies, immigration authorities, or external third parties.</strong> Your data remains strictly confidential, private, and secure within our platform.</p>
          </Modal>
        )}
        {modal === 'terms' && (
          <Modal id="terms" title="Terms of Service" onClose={() => setModal(null)}>
            <p>Welcome to VerifED Global. By creating an account and logging in, you agree to these terms of service.</p>
            <p><strong>Marketing and Communication Agreement:</strong> By signing up with your username, password, and email, <strong>you expressly agree to receive marketing, platform updates, and service communication emails from us.</strong> You may opt out of communications at any time by contacting support.</p>
            <p><strong>Non-Official Preview:</strong> All credential mappings generated by this application are for preliminary guidance and informational purposes only and do not constitute official NACES-accredited evaluations.</p>
            <p>All intellectual property and code assets are engineered by LAD MEDIA.</p>
          </Modal>
        )}
      </div>
    </WouterRouter>
    </LangCtx.Provider>
  );
}
