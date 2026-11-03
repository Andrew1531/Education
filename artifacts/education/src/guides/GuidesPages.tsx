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

const linkCls = 'text-[#3F35C2] underline decoration-[#C7CBFA] underline-offset-4 hover:decoration-[#5B4FE9] rounded-sm';

function Breadcrumbs({ lang, current }: { lang: Lang; current?: string }) {
  const u = ui[lang];
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[#4B5568]">
      <ol className="flex flex-wrap items-center gap-2">
        <li><Link href="/" className={linkCls}>{u.home}</Link></li>
        <li aria-hidden="true">/</li>
        <li>{current ? <Link href="/guides" className={linkCls}>{u.nav}</Link> : <span aria-current="page" className="font-semibold text-[#0F172A]">{u.nav}</span>}</li>
        {current && (<><li aria-hidden="true">/</li><li aria-current="page" className="font-semibold text-[#0F172A] break-words min-w-0">{current}</li></>)}
      </ol>
    </nav>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border-l-4 border-[#5B4FE9] bg-[#EEF0FF] px-5 py-4 text-sm leading-relaxed text-[#273449]">{children}</p>
  );
}

function Cta({ lang }: { lang: Lang }) {
  const u = ui[lang];
  return (
    <aside className="mt-16 flex flex-col gap-6 rounded-[32px] bg-[#0F172A] px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-12" aria-labelledby="guide-cta">
      <div className="max-w-xl">
        <h2 id="guide-cta" className="text-2xl sm:text-3xl font-bold text-[#FCFCFF]">{u.ctaTitle}</h2>
        <p className="mt-3 text-base leading-relaxed text-[#E2E4F3]">{u.ctaBody}</p>
      </div>
      <Link href="/" data-testid="link-guide-cta" className="vf-btn shrink-0">{u.ctaButton}</Link>
    </aside>
  );
}

export function GuidesIndex({ lang }: { lang: Lang }) {
  const u = ui[lang];
  return (
    <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto w-full max-w-7xl flex-grow px-4 sm:px-6 pt-6 pb-16 outline-none" lang={lang}>
      <header className="vf-rise rounded-[36px] bg-[#EEF0FF] px-6 py-12 sm:px-12 sm:py-16">
        <Breadcrumbs lang={lang} />
        <h1 className="vf-display mt-8 max-w-3xl text-[40px] sm:text-[56px] font-bold leading-[1.04] text-[#0F172A]">{u.indexTitle}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#4B5568]">{u.indexIntro}</p>
      </header>
      <ul className="mt-10 grid gap-5 md:grid-cols-2">
        {guides.map((g, i) => (
          <li key={g.slug}>
            <article className="vf-card group relative flex h-full flex-col p-7 sm:p-9 transition-colors hover:border-[#5B4FE9]">
              <p className="vf-display text-sm font-bold text-[#3F35C2]">{String(i + 1).padStart(2, '0')}</p>
              <h2 className="mt-6 text-2xl font-bold leading-snug text-[#0F172A]">
                <Link href={`/guides/${g.slug}`} className="after:absolute after:inset-0 after:rounded-[28px] focus-visible:outline-none group-focus-within:underline" data-testid={`link-guide-${g.slug}`}>{g[lang].title}</Link>
              </h2>
              <p className="mt-3 flex-grow text-base leading-relaxed text-[#4B5568]">{g[lang].summary}</p>
              <div className="mt-8 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#4B5568]">{g[lang].readTime}</p>
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#5B4FE9] text-[#FCFCFF] transition-transform group-hover:translate-x-1">→</span>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <div className="mt-10"><Notice>{u.disclaimer}</Notice></div>
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
    <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto w-full max-w-7xl flex-grow px-4 sm:px-6 pt-6 pb-16 outline-none" lang={lang}>
      <article data-testid={`article-${slug}`}>
        <header className="vf-rise rounded-[36px] bg-[#EEF0FF] px-6 py-12 sm:px-12 sm:py-16">
          <Breadcrumbs lang={lang} current={g.title} />
          <h1 className="vf-display mt-8 max-w-4xl text-[34px] sm:text-[50px] font-bold leading-[1.06] text-[#0F172A] break-words">{g.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#273449]">{g.summary}</p>
          <p className="mt-6 inline-flex flex-wrap gap-x-3 rounded-full bg-[#FFFFFE] px-4 py-2 text-sm font-medium text-[#4B5568]">{g.readTime} <span aria-hidden="true">·</span> <span>{u.updated}: <time dateTime={content.updated}>{content.updated}</time></span></p>
        </header>
        <div className="mt-12 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
          <nav aria-labelledby="toc" className="lg:sticky lg:top-24 lg:self-start rounded-[24px] border border-[#E2E4F3] bg-[#FFFFFE] p-5">
            <h2 id="toc" className="text-xs font-bold uppercase tracking-[0.14em] text-[#4B5568]">{u.onThisPage}</h2>
            <ol className="mt-4 space-y-1 text-[15px]">
              {g.sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`} className="flex gap-3 rounded-xl px-2 py-2 text-[#273449] hover:bg-[#EEF0FF] hover:text-[#3F35C2]"><span className="font-bold text-[#3F35C2]">{i + 1}</span><span>{s.heading}</span></a></li>)}
              {g.templates && <li><a href="#templates" className="flex gap-3 rounded-xl px-2 py-2 text-[#273449] hover:bg-[#EEF0FF] hover:text-[#3F35C2]"><span className="font-bold text-[#3F35C2]">{g.sections.length + 1}</span><span>{g.templatesTitle}</span></a></li>}
            </ol>
            <Link href="/guides" className="mt-4 block border-t border-[#E2E4F3] px-2 pt-4 text-sm font-semibold text-[#3F35C2]">← {u.allGuides}</Link>
          </nav>
          <div className="min-w-0 max-w-3xl">
            {g.sections.map((s, si) => (
              <section key={s.id} id={s.id} className={`scroll-mt-28 ${si > 0 ? 'mt-14 border-t border-[#E2E4F3] pt-14' : ''}`}>
                <h2 className="text-[28px] font-bold leading-tight text-[#0F172A]">{s.heading}</h2>
                {s.paragraphs.map((p, i) => <p key={i} className="mt-5 text-[17px] leading-[1.75] text-[#273449]">{p}</p>)}
                {s.sourceRefs && (
                  <p className="mt-4 text-sm text-[#4B5568]">
                    {u.sources}: {s.sourceRefs.map((r, i) => <span key={r}>{i > 0 && ', '}<a href={`#source-${r}`} className={linkCls}>[{srcNum(r)}] {sources[r].publisher}</a></span>)}
                  </p>
                )}
                {s.checklist && (
                  <div className="mt-6 rounded-[24px] bg-[#EEF0FF] p-6">
                    {s.checklistTitle && <h3 className="text-lg font-bold text-[#0F172A]">{s.checklistTitle}</h3>}
                    <ul className="mt-4 space-y-3">
                      {s.checklist.map((c, i) => (
                        <li key={i} className="flex gap-3 text-[#273449] leading-relaxed">
                          <span aria-hidden="true" className="mt-1 h-5 w-5 flex-none rounded-md border-2 border-[#5B4FE9] bg-[#FFFFFE]" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
            {g.templates && (
              <section id="templates" className="mt-14 border-t border-[#E2E4F3] pt-14 scroll-mt-28">
                <h2 className="text-[28px] font-bold text-[#0F172A]">{g.templatesTitle}</h2>
                <div className="mt-5">{g.templatesNote && <Notice>{g.templatesNote}</Notice>}</div>
                {g.templates.map((tp) => (
                  <figure key={tp.label} className="mt-5 overflow-hidden rounded-[20px] border border-[#E2E4F3] bg-[#FFFFFE]">
                    <figcaption className="border-b border-[#E2E4F3] bg-[#FAFAFF] px-5 py-3 text-sm font-bold text-[#3F35C2]">{tp.label}</figcaption>
                    <pre className="whitespace-pre-wrap break-words p-5 font-mono text-sm leading-relaxed text-[#0F172A]">{tp.lines.join('\n')}</pre>
                  </figure>
                ))}
              </section>
            )}
            <div className="mt-14"><Notice>{u.disclaimer}</Notice></div>
            <section aria-labelledby="sources" className="mt-14">
              <h2 id="sources" className="text-[28px] font-bold text-[#0F172A]">{u.sources}</h2>
              <p className="mt-2 text-sm text-[#4B5568]">{u.sourcesNote}</p>
              <ol className="mt-6 divide-y divide-[#E2E4F3] rounded-[24px] border border-[#E2E4F3] bg-[#FFFFFE]">
                {guide.sources.map((id, i) => (
                  <li key={id} id={`source-${id}`} className="flex gap-4 p-5 leading-relaxed text-[#273449] scroll-mt-28">
                    <span className="vf-display font-bold text-[#3F35C2]">[{i + 1}]</span>
                    <span>{sources[id].publisher}. <a href={sources[id].url} className={linkCls} rel="noopener noreferrer" target="_blank">{sources[id].title}</a>
                      <span className="block text-sm text-[#4B5568] mt-1">{sources[id].scope[lang]}</span></span>
                  </li>
                ))}
              </ol>
            </section>
            <nav aria-labelledby="related" className="mt-14">
              <h2 id="related" className="text-[28px] font-bold text-[#0F172A]">{u.related}</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {guide.related.map((r) => { const rg = guides.find((x) => x.slug === r)!; return <li key={r}><Link href={`/guides/${r}`} className="flex h-full items-center justify-between gap-4 rounded-[20px] bg-[#EEF0FF] p-5 font-semibold text-[#0F172A] hover:bg-[#E1E4FF]">{rg[lang].title}<span aria-hidden="true" className="text-[#3F35C2]">→</span></Link></li>; })}
                <li><Link href="/guides" className="flex h-full items-center justify-between gap-4 rounded-[20px] border border-[#E2E4F3] p-5 font-semibold text-[#3F35C2] hover:border-[#5B4FE9]">{u.allGuides}<span aria-hidden="true">→</span></Link></li>
              </ul>
            </nav>
          </div>
        </div>
      </article>
      <Cta lang={lang} />
    </main>
  );
}

export default function GuidesRoute({ slug, lang }: { slug?: string; lang: Lang }) {
  return slug ? <GuideArticle slug={slug} lang={lang} /> : <GuidesIndex lang={lang} />;
}
