import { useState } from 'react';
import logoUrl from './logo.png';
import './_group.css';

const fieldClassName = 'w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

function LanguageToggle() {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all cursor-pointer select-none"
      aria-label="Switch to Spanish"
    >
      <span>🇺🇸</span>
      <span>EN</span>
      <span className="text-slate-600 font-normal">/</span>
      <span className="text-slate-500 font-normal">ES</span>
    </button>
  );
}

function Navigation() {
  return (
    <nav className="relative z-50 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <button type="button" className="flex items-center cursor-pointer bg-transparent border-none p-0">
          <img src={logoUrl} alt="VerifED Global" className="h-10 w-auto object-contain" />
        </button>
        <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-400">
          <button type="button" className="hover:text-white transition-colors bg-transparent border-none text-inherit cursor-pointer">About</button>
          <button type="button" className="hover:text-white transition-colors bg-transparent border-none text-inherit cursor-pointer">How It Works</button>
          <LanguageToggle />
        </div>
        <div className="flex items-center gap-3">
          <div className="md:hidden"><LanguageToggle /></div>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const features = [
    ['🗺️', 'Credential Mapping', 'See exactly how your foreign degree maps to U.S. equivalency standards, institution types, and academic frameworks.', 'border-indigo-500/20 hover:border-indigo-500/40'],
    ['🏛️', 'NACES Agency Matching', 'Find the right accredited evaluation agency for your specific country, degree level, and end goal.', 'border-violet-500/20 hover:border-violet-500/40'],
    ['📋', 'Licensing Roadmap', 'Get field-specific licensing and regulatory requirements for your U.S. career path, state by state.', 'border-cyan-500/20 hover:border-cyan-500/40'],
    ['💼', 'Job Board Access', 'Direct links to U.S. job boards actively seeking internationally educated professionals in your field.', 'border-emerald-500/20 hover:border-emerald-500/40'],
  ];

  return (
    <>
      <div className="text-center max-w-4xl mx-auto pt-6">
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 font-semibold mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
          🛰️ U.S. Career Guidance for Internationally Educated Job Seekers
        </div>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.05]">
          Your Education Abroad.<br />
          <span className="bg-gradient-to-r from-blue-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            Your Next Career Step in the U.S.
          </span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-14">
          Understand how to present your foreign degree to U.S. employers, when you may need an official credential evaluation, and which licensing requirements apply to your field—before you spend money on evaluations.
        </p>
        <div className="inline-flex flex-col sm:flex-row items-center divide-y sm:divide-y-0 sm:divide-x divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-sm">
          {[['180+', 'Countries Covered'], ['NACES', 'Agency Aligned'], ['< 2 min', 'To Your Roadmap']].map(([value, label]) => (
            <div key={label} className="px-8 py-4 text-center">
              <div className="text-2xl font-black bg-gradient-to-r from-blue-400 to-fuchsia-500 bg-clip-text text-transparent">{value}</div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {features.map(([icon, title, description, border]) => (
          <div key={title} className={`group bg-slate-900/60 border ${border} rounded-2xl p-6 backdrop-blur-sm transition-all duration-200 hover:bg-slate-800/60`}>
            <span className="text-2xl mb-3 block">{icon}</span>
            <h3 className="text-white font-bold text-sm mb-1.5">{title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function AccountEntry() {
  const [isSignUp, setIsSignUp] = useState(true);

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">
          {isSignUp ? 'Create Your Account' : 'Sign In to Your Account'}
        </span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>
      <div className="glass-panel p-8 rounded-3xl relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-base tracking-tight">
            {isSignUp ? 'Create Your Account' : 'Sign In to Your Account'}
          </h2>
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline bg-transparent border-none cursor-pointer whitespace-nowrap ml-3">
            {isSignUp ? 'Already registered? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-5 leading-relaxed">Your information is kept strictly private and never shared with government agencies or third parties.</p>
        <form onSubmit={(event) => event.preventDefault()} className="space-y-4" aria-label="Static account-entry preview; no credentials are collected">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Username</label>
            <input className={fieldClassName} placeholder="e.g., alex_global26" readOnly />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Password</label>
            <input type="password" className={fieldClassName} placeholder="••••••••••••" readOnly />
          </div>
          {isSignUp && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Correspondence Email</label>
                <input type="email" className={fieldClassName} placeholder="name@example.com" readOnly />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Country of Education <span className="text-slate-600 normal-case">(Opt)</span></label>
                <input className={fieldClassName} placeholder="e.g., India, Nigeria, Brazil, UK" readOnly />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Primary Goal <span className="text-slate-600 normal-case">(Opt)</span></label>
                <select defaultValue="" className={fieldClassName} aria-label="Primary Goal">
                  <option value="">Select goal...</option>
                  <option>University Admission</option>
                  <option>Employment / HR</option>
                  <option>Professional Licensing</option>
                  <option>Immigration (USCIS)</option>
                </select>
              </div>
            </>
          )}
          <button type="button" className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2">
            <span>{isSignUp ? 'Create Account & Access Evaluator' : 'Sign In & Access Evaluator'}</span>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function CareerGuidanceEntry() {
  return (
    <div>
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 mb-6 shadow-sm">
          <span className="text-indigo-400 font-semibold">Educational Pathways Guidance: Aligning with U.S. standard frameworks</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          Understand Your Foreign Education In{' '}
          <span className="bg-gradient-to-r from-blue-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">U.S. Equivalency Terms</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-normal leading-relaxed">
          Understand your academic background in the context of U.S. standards and generate a concrete roadmap for official verification.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-5">
          <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg tracking-tight">Credential Parameters</h2>
              <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">STEP 1 OF 2</span>
            </div>
            <form onSubmit={(event) => event.preventDefault()} className="space-y-5" aria-label="Static evaluator preview; no information is collected">
              {[['Country of Education', 'e.g., India, Nigeria, Brazil, UK'], ['Institution Name', 'e.g., University of Lagos']].map(([label, placeholder]) => (
                <div key={label}>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{label}</label>
                  <input className={fieldClassName} placeholder={placeholder} readOnly />
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[['Degree Level', 'e.g., B.Sc, M.Eng, MBBS'], ['Field of Study', 'e.g., Accounting, Computer Science']].map(([label, placeholder]) => (
                  <div key={label}>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{label}</label>
                    <input className={fieldClassName} placeholder={placeholder} readOnly />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Credits / Years <span className="text-slate-500 font-normal">(Opt)</span></label>
                  <input className={fieldClassName} placeholder="e.g., 4 Years / 180 ECTS" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Primary Goal</label>
                  <select defaultValue="" className={fieldClassName}>
                    <option value="">Select goal...</option>
                    <option>University Admission</option>
                    <option>Employment / HR</option>
                    <option>Professional Licensing</option>
                    <option>Immigration (USCIS)</option>
                  </select>
                </div>
              </div>
              <button type="button" className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2">
                <span>Crawl &amp; Generate Equivalency Report</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </form>
          </div>
        </section>
        <section className="lg:col-span-7">
          <div className="glass-panel p-16 text-center rounded-3xl flex flex-col items-center justify-center min-h-[500px] border-dashed border-2 border-slate-800/80">
            <div className="w-20 h-20 rounded-2xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-center text-3xl text-indigo-400 mb-6 shadow-xl scraper-pulse">🛰️</div>
            <h3 className="font-bold text-white text-xl mb-2">Educational Pathways Awaiting Input</h3>
            <p className="text-slate-400 text-sm max-w-sm leading-relaxed">Fill out your academic parameters on the left to review alignment with U.S. standards and build your roadmap.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function Current() {
  return (
    <div className="career-navigation bg-slate-950 text-slate-100 min-h-screen font-sans relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      <div className="glow-effect -top-40 -left-40 rounded-full" />
      <div className="glow-effect top-1/3 -right-40 rounded-full" />
      <Navigation />
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 w-full">
        <div className="space-y-24">
          <Hero />
          <AccountEntry />
          <CareerGuidanceEntry />
        </div>
      </main>
    </div>
  );
}