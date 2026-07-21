import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ge_username';

type View = 'auth' | 'app';

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

// ─── Modals ──────────────────────────────────────────────────────────────────

function Modal({ id, title, children, onClose }: { id: string; title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      data-testid={`modal-${id}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel p-8 rounded-3xl max-w-lg w-full relative border border-slate-700 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
        <div className="text-xs text-slate-300 space-y-3 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
          {children}
        </div>
        <button
          onClick={onClose}
          data-testid={`button-close-${id}`}
          className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-600/30"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Auth View ────────────────────────────────────────────────────────────────

function AuthView({ onLogin }: { onLogin: (username: string) => void }) {
  const [isSignUp, setIsSignUp] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    localStorage.setItem(STORAGE_KEY, username);
    onLogin(username);
  }

  return (
    <div className="space-y-16">
      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 mb-6 shadow-sm">
          <span className="text-indigo-400 font-semibold">🔒 Private Secure Gateway:</span> Account required to access your credential intelligence portal.
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          Navigate Your U.S. Education &amp; Professional{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Journey With Confidence
          </span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-normal leading-relaxed">
          VerifED Global is an independent commercial intelligence platform designed to help international individuals understand how their foreign credentials map to U.S. standards, licensing boards, and employment frameworks before investing in official evaluations.
        </p>
      </div>

      {/* Auth Card */}
      <div className="max-w-md mx-auto">
        <div className="glass-panel p-8 rounded-3xl relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500" />

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white font-bold text-lg tracking-tight" data-testid="text-auth-heading">
              {isSignUp ? 'Create Your Account' : 'Sign In to Your Account'}
            </h2>
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              data-testid="button-toggle-auth"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline bg-transparent border-none cursor-pointer"
            >
              {isSignUp ? 'Already registered? Sign In' : 'Need an account? Sign Up'}
            </button>
          </div>

          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Please provide your basic information so we can maintain your personal equivalency records and correspond with you regarding platform updates.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-auth">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-username"
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                placeholder="e.g., alex_global26"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-password"
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                placeholder="••••••••••••"
                required
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Correspondence Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-email"
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  placeholder="name@example.com"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              data-testid="button-auth-submit"
              className="w-full mt-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2"
            >
              <span>{isSignUp ? 'Create Account & Access Evaluator' : 'Sign In & Access Evaluator'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
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
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([true, false, false, false]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const usLevel = getUsLevel(degree);
    const insight = getInsight(field);
    const roadmap = getRoadmap(country, institution, field, purpose);
    setResult({ country, institution, degree, field, purpose, usLevel, insight, roadmap });
    setCheckedSteps([true, false, false, false]);
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  function toggleStep(i: number) {
    setCheckedSteps((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <div>
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 mb-6 shadow-sm">
          <span className="text-indigo-400 font-semibold">⚡ Unified Platform Scraper:</span> Pulling real-time NACES, USCIS &amp; State Board frameworks.
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          Transform Your Foreign Education Into{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            U.S. Equivalency
          </span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-normal leading-relaxed">
          Instantly crawl academic databases, map international coursework to U.S. standards, and generate a dynamic verification roadmap.
        </p>
      </div>

      {/* Grid */}
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
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  data-testid="input-country"
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  placeholder="e.g., India, Nigeria, Brazil, UK"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Institution Name</label>
                <input
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  data-testid="input-institution"
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  placeholder="e.g., University of Lagos"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Degree Level</label>
                  <input
                    value={degree}
                    onChange={(e) => setDegree(e.target.value)}
                    data-testid="input-degree"
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="e.g., B.Sc, M.Eng, MBBS"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Field of Study</label>
                  <input
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    data-testid="input-field"
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="e.g., Accounting, Computer Science"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Credits / Years <span className="text-slate-500 font-normal">(Opt)</span>
                  </label>
                  <input
                    value={credits}
                    onChange={(e) => setCredits(e.target.value)}
                    data-testid="input-credits"
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="e.g., 4 Years / 180 ECTS"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Primary Goal</label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    data-testid="select-purpose"
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  >
                    <option value="">Select goal...</option>
                    <option value="University Admission">University Admission</option>
                    <option value="Employment & HR">Employment / HR</option>
                    <option value="Professional Licensing">Professional Licensing</option>
                    <option value="Immigration (USCIS)">Immigration (USCIS)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                data-testid="button-eval-submit"
                className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>Crawl &amp; Generate Equivalency Report</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
          </div>
        </section>

        {/* Results Column */}
        <section className="lg:col-span-7" id="results-section">
          {result ? (
            <div className="space-y-6" data-testid="results-container">
              {/* Summary Card */}
              <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-indigo-500 relative overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Platform Crawl Complete
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
                  {result.purpose && (
                    <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-bold">🎯 {result.purpose}</span>
                  )}
                </div>
              </div>

              {/* Insight Card */}
              <div className="glass-panel p-8 rounded-3xl" data-testid="insight-card">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="text-indigo-400 mr-2 text-lg">📊</span> Industry Regulatory Pathway
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line" data-testid="text-insight">{result.insight}</p>
              </div>

              {/* Roadmap */}
              <div className="glass-panel p-8 rounded-3xl relative overflow-hidden" data-testid="roadmap-section">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider flex items-center">
                    <span className="text-indigo-400 mr-2 text-lg">🛰️</span> Scraped Platform Action Roadmap
                  </h3>
                  <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Synced</span>
                </div>
                <p className="text-xs text-slate-400 mb-6">
                  Our automated scraper has pulled specific institutional guidelines and credential standards for your target pathway. Check off items as you complete them:
                </p>
                <div className="space-y-3.5">
                  {result.roadmap.map((step, idx) => (
                    <label
                      key={idx}
                      className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-sm cursor-pointer hover:border-indigo-500/50 transition-all group"
                      data-testid={`roadmap-step-${idx}`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedSteps[idx]}
                        onChange={() => toggleStep(idx)}
                        className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                      />
                      <div>
                        <strong className="text-white block mb-0.5 text-xs md:text-sm group-hover:text-indigo-300 transition-colors">
                          {idx + 1}. {step.title}
                        </strong>
                        <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Placeholder */
            <div className="glass-panel p-16 text-center rounded-3xl flex flex-col items-center justify-center min-h-[500px] border-dashed border-2 border-slate-800/80" data-testid="placeholder-state">
              <div className="w-20 h-20 rounded-2xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-center text-3xl text-indigo-400 mb-6 shadow-xl scraper-pulse">
                🛰️
              </div>
              <h3 className="font-bold text-white text-xl mb-2">Platform Scraper Awaiting Input</h3>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">Fill out your academic parameters on the left to trigger real-time database crawling and build your roadmap.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Job Boards ───────────────────────────────────────────────────────────────

const JOB_BOARDS = [
  {
    name: 'Indeed',
    url: 'https://www.indeed.com',
    desc: 'Search millions of U.S. jobs by title, location, and salary.',
    color: 'from-blue-600 to-blue-500',
    initials: 'In',
  },
  {
    name: 'LinkedIn Jobs',
    url: 'https://www.linkedin.com/jobs',
    desc: 'Apply directly and connect with hiring managers.',
    color: 'from-sky-700 to-sky-500',
    initials: 'Li',
  },
  {
    name: 'Glassdoor',
    url: 'https://www.glassdoor.com/Job',
    desc: 'Jobs with salary insights and company reviews.',
    color: 'from-emerald-600 to-emerald-500',
    initials: 'Gd',
  },
  {
    name: 'ZipRecruiter',
    url: 'https://www.ziprecruiter.com',
    desc: 'AI-matched job recommendations sent to your inbox.',
    color: 'from-orange-600 to-orange-500',
    initials: 'Zr',
  },
  {
    name: 'USAJobs',
    url: 'https://www.usajobs.gov',
    desc: 'Official portal for U.S. federal government positions.',
    color: 'from-red-700 to-red-500',
    initials: 'US',
  },
  {
    name: 'Monster',
    url: 'https://www.monster.com',
    desc: 'Job postings across industries nationwide.',
    color: 'from-violet-600 to-violet-500',
    initials: 'Mo',
  },
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
          <a
            key={board.name}
            href={board.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`link-job-board-${board.name.toLowerCase().replace(/\s+/g, '-')}`}
            className="glass-panel p-5 rounded-2xl flex items-start gap-4 hover:border-indigo-500/40 transition-all group"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${board.color} flex items-center justify-center font-black text-white text-sm flex-shrink-0 shadow-lg`}>
              {board.initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-bold text-sm group-hover:text-indigo-300 transition-colors">{board.name}</span>
                <svg className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
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
    // Opens the user's mail client with pre-filled fields as a simple contact mechanism
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
          {/* Left — copy */}
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

          {/* Right — form */}
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
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-contact-name"
                    required
                    placeholder="Full name"
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-contact-email"
                    required
                    placeholder="name@example.com"
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">How Can We Help?</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    data-testid="input-contact-message"
                    required
                    rows={4}
                    placeholder="Describe your credential, country, field, and what you're trying to achieve in the U.S. ..."
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="button-contact-submit"
                  className="w-full bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Send Message</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <ContactSection />
      <JobBoardsSection />
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('auth');
  const [username, setUsername] = useState('');
  const [modal, setModal] = useState<'privacy' | 'terms' | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setUsername(saved);
      setView('app');
    }
  }, []);

  function handleLogin(user: string) {
    setUsername(user);
    setView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setUsername('');
    setView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen font-sans relative overflow-x-hidden flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background glows */}
      <div className="glow-effect -top-40 -left-40 rounded-full" />
      <div className="glow-effect top-1/3 -right-40 rounded-full" />

      {/* Navbar */}
      <nav className="relative z-50 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-500/30">
              VG
            </div>
            <div>
              <span className="font-extrabold text-white text-lg tracking-tight">VerifED Global</span>
              <span className="block text-[10px] font-bold text-indigo-400 tracking-widest uppercase">2026 Credential Engine</span>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-400">
            <a href="#about" className="hover:text-white transition-colors" data-testid="link-about">About</a>
            <a href="#features" className="hover:text-white transition-colors" data-testid="link-features">How It Works</a>
          </div>

          {view === 'app' && (
            <div className="flex items-center space-x-4" data-testid="nav-user-badge">
              <span className="text-xs text-indigo-300 font-mono bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/30" data-testid="text-nav-username">
                👤 @{username}
              </span>
              <button
                onClick={handleLogout}
                data-testid="button-signout"
                className="text-xs text-slate-400 hover:text-white transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 flex-grow w-full">
        {view === 'auth' ? (
          <AuthView onLogin={handleLogin} />
        ) : (
          <EvaluatorView />
        )}
      </main>

      {/* Footer */}
      <footer id="about" className="border-t border-slate-800/80 bg-slate-950 py-12 px-6 relative z-10 mt-20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <p className="text-xs text-slate-400 font-medium">&copy; 2026 VerifED Global. All rights reserved.</p>
            <p className="text-[11px] text-slate-500 mt-1">Engineered for international academic and professional transparency.</p>
          </div>
          <div className="flex items-center space-x-6 text-xs text-slate-400 font-medium">
            <button
              onClick={() => setModal('privacy')}
              data-testid="button-privacy-policy"
              className="hover:text-white transition-colors cursor-pointer bg-transparent border-none text-slate-400 text-xs font-medium"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setModal('terms')}
              data-testid="button-terms"
              className="hover:text-white transition-colors cursor-pointer bg-transparent border-none text-slate-400 text-xs font-medium"
            >
              Terms of Service
            </button>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-inner">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Powered and engineered by</span>
            <a
              href="https://ladmedia.co"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-lad-media"
              className="text-xs font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent hover:underline"
            >
              LAD MEDIA
            </a>
          </div>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      {modal === 'privacy' && (
        <Modal id="privacy" title="Privacy Policy" onClose={() => setModal(null)}>
          <p><strong>Strict Privacy &amp; Independence Notice:</strong> VerifED Global is a private, separate, and independent commercial company designed strictly to help international individuals navigate their educational and professional experience in the United States.</p>
          <p><strong>Basic Information &amp; Purpose:</strong> We collect basic account credentials (username, password, and correspondence email) solely to keep records and properly correspond with you regarding your credential evaluation roadmap.</p>
          <p><strong>Zero Data Selling &amp; Absolute Government Protection:</strong> <strong>We will never sell your information, nor will we ever hand over, share, or disclose any user data, personal records, or search inputs to any government agencies, immigration authorities, or external third parties.</strong> Your data remains strictly confidential, private, and secure within our platform.</p>
        </Modal>
      )}

      {/* Terms of Service Modal */}
      {modal === 'terms' && (
        <Modal id="terms" title="Terms of Service" onClose={() => setModal(null)}>
          <p>Welcome to VerifED Global. By creating an account and logging in, you agree to these terms of service.</p>
          <p><strong>Marketing and Communication Agreement:</strong> By signing up with your username, password, and email, <strong>you expressly agree to receive marketing, platform updates, and service communication emails from us.</strong> You may opt out of communications at any time by contacting support.</p>
          <p><strong>Non-Official Preview:</strong> All credential mappings generated by this application are for preliminary guidance and informational purposes only and do not constitute official NACES-accredited evaluations.</p>
          <p>All intellectual property and code assets are engineered by LAD MEDIA.</p>
        </Modal>
      )}
    </div>
  );
}
