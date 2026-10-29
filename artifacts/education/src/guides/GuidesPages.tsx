import { Link } from 'wouter';
import content from './guides-content.json';

type Lang = 'en' | 'es';
type Section = { id: string; heading: string; paragraphs: string[]; checklistTitle?: string; checklist?: string[]; sourceRefs?: string[] };
type Template = { label: string; lines: string[] };
type GuideText = { title: string; description: string; summary: string; readTime: string; sections: Section[]; templatesTitle?: string; templatesNote?: string; templates?: Template[] };
type Guide = { slug: string; sources: string[]; related: string[]; en: GuideText; es: GuideText };
type Source = { publisher: string; title: string; url: string; scope: Record<Lang, string> };

const guides = content.guides as Guide[];
const sources = content.sources as Record<string, Source>;
const ui = content.ui;

const linkCls = 'text-indigo-300 underline decoration-indigo-400/40 underline-offset-4 hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 rounded-sm';

function Breadcrumbs({ lang, current }: { lang: Lang; current?: string }) {
  const u = ui[lang];
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-400 mb-8">
      <ol className="flex flex-wrap items-center gap-2">
        <li><Link href="/" className={linkCls}>{u.home}</Link></li>
        <li aria-hidden="true">/</li>
        <li>{current ? <Link href="/guides" className={linkCls}>{u.nav}</Link> : <span aria-current="page" className="text-slate-200">{u.nav}</span>}</li>
        {current && (<><li aria-hidden="true">/</li><li aria-current="page" className="text-slate-200 break-words min-w-0">{current}</li></>)}
      </ol>
    </nav>
  );
}

function Cta({ lang }: { lang: Lang }) {
  const u = ui[lang];
  return (
    <aside className="mt-14 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-6 sm:p-8" aria-labelledby="guide-cta">
      <h2 id="guide-cta" className="text-xl font-bold text-white">{u.ctaTitle}</h2>
      <p className="mt-2 text-slate-300 leading-relaxed">{u.ctaBody}</p>
      <Link href="/" data-testid="link-guide-cta" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{u.ctaButton}</Link>
    </aside>
  );
}

export function GuidesIndex({ lang }: { lang: Lang }) {
  const u = ui[lang];
  return (
    <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto w-full max-w-3xl flex-grow px-5 sm:px-6 pt-12 pb-16 outline-none" lang={lang}>
      <Breadcrumbs lang={lang} />
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">{u.indexTitle}</h1>
      <p className="mt-4 text-lg text-slate-300 leading-relaxed">{u.indexIntro}</p>
      <ul className="mt-10 space-y-5">
        {guides.map((g) => (
          <li key={g.slug}>
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition-colors hover:border-indigo-500/50">
              <h2 className="text-xl font-bold text-white">
                <Link href={`/guides/${g.slug}`} className="hover:text-indigo-200 focus-visible:outline-2 focus-visible:outline-indigo-400 rounded-sm" data-testid={`link-guide-${g.slug}`}>{g[lang].title}</Link>
              </h2>
              <p className="mt-2 text-slate-300 leading-relaxed">{g[lang].summary}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{g[lang].readTime}</p>
            </article>
          </li>
        ))}
      </ul>
      <p className="mt-10 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">{u.disclaimer}</p>
      <Cta lang={lang} />
    </main>
  );
}

export function GuideArticle({ slug, lang }: { slug: string; lang: Lang }) {
  const guide = guides.find((g) => g.slug === slug);
  const u = ui[lang];
  if (!guide) return null;
  const g = guide[lang];
  const srcNum = (id: string) => guide.sources.indexOf(id) + 1;
  return (
    <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto w-full max-w-3xl flex-grow px-5 sm:px-6 pt-12 pb-16 outline-none" lang={lang}>
      <Breadcrumbs lang={lang} current={g.title} />
      <article data-testid={`article-${slug}`}>
        <header>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight break-words">{g.title}</h1>
          <p className="mt-4 text-lg text-slate-200 leading-relaxed">{g.summary}</p>
          <p className="mt-3 text-sm text-slate-400">{g.readTime} · {u.updated}: <time dateTime={content.updated}>{content.updated}</time></p>
        </header>
        <nav aria-labelledby="toc" className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 id="toc" className="text-sm font-bold uppercase tracking-wider text-slate-300">{u.onThisPage}</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-300">
            {g.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className={linkCls}>{s.heading}</a></li>)}
            {g.templates && <li><a href="#templates" className={linkCls}>{g.templatesTitle}</a></li>}
          </ol>
        </nav>
        {g.sections.map((s) => (
          <section key={s.id} id={s.id} className="mt-12 scroll-mt-28">
            <h2 className="text-2xl font-bold text-white">{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i} className="mt-4 text-slate-300 leading-relaxed">{p}</p>)}
            {s.sourceRefs && (
              <p className="mt-3 text-sm text-slate-400">
                {u.sources}: {s.sourceRefs.map((r, i) => <span key={r}>{i > 0 && ', '}<a href={`#source-${r}`} className={linkCls}>[{srcNum(r)}] {sources[r].publisher}</a></span>)}
              </p>
            )}
            {s.checklist && (
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                {s.checklistTitle && <h3 className="font-bold text-white">{s.checklistTitle}</h3>}
                <ul className="mt-3 space-y-3">
                  {s.checklist.map((c, i) => (
                    <li key={i} className="flex gap-3 text-slate-200 leading-relaxed">
                      <span aria-hidden="true" className="mt-1 h-4 w-4 flex-none rounded border-2 border-indigo-400/70" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
        {g.templates && (
          <section id="templates" className="mt-12 scroll-mt-28">
            <h2 className="text-2xl font-bold text-white">{g.templatesTitle}</h2>
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">{g.templatesNote}</p>
            {g.templates.map((tp) => (
              <figure key={tp.label} className="mt-5 rounded-xl border border-dashed border-slate-600 bg-slate-900/70 p-5">
                <figcaption className="text-sm font-bold text-indigo-200">{tp.label}</figcaption>
                <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-slate-200">{tp.lines.join('\n')}</pre>
              </figure>
            ))}
          </section>
        )}
        <p className="mt-12 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">{u.disclaimer}</p>
        <section aria-labelledby="sources" className="mt-12">
          <h2 id="sources" className="text-2xl font-bold text-white">{u.sources}</h2>
          <p className="mt-2 text-sm text-slate-400">{u.sourcesNote}</p>
          <ol className="mt-4 space-y-4">
            {guide.sources.map((id, i) => (
              <li key={id} id={`source-${id}`} className="text-slate-300 leading-relaxed">
                [{i + 1}] {sources[id].publisher}. <a href={sources[id].url} className={linkCls} rel="noopener noreferrer" target="_blank">{sources[id].title}</a>
                <span className="block text-sm text-slate-400 mt-1">{sources[id].scope[lang]}</span>
              </li>
            ))}
          </ol>
        </section>
        <nav aria-labelledby="related" className="mt-12">
          <h2 id="related" className="text-2xl font-bold text-white">{u.related}</h2>
          <ul className="mt-4 space-y-2">
            {guide.related.map((r) => { const rg = guides.find((x) => x.slug === r)!; return <li key={r}><Link href={`/guides/${r}`} className={linkCls}>{rg[lang].title}</Link></li>; })}
            <li><Link href="/guides" className={linkCls}>{u.allGuides}</Link></li>
          </ul>
        </nav>
      </article>
      <Cta lang={lang} />
    </main>
  );
}

export default function GuidesRoute({ slug, lang }: { slug?: string; lang: Lang }) {
  return slug ? <GuideArticle slug={slug} lang={lang} /> : <GuidesIndex lang={lang} />;
}
