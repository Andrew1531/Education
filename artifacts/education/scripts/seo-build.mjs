import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist/public');
const pages = JSON.parse(await readFile(path.join(root, 'seo-pages.json'), 'utf8'));
// Same JSON the React guide pages render — static HTML never diverges from the app copy.
const content = JSON.parse(await readFile(path.join(root, 'src/guides/guides-content.json'), 'utf8'));
const origin = 'https://verifed.co';
const shell = await readFile(path.join(out, 'index.html'), 'utf8');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const org = { '@type': 'Organization', '@id': origin + '/#organization', name: 'VerifED Global', url: origin + '/', logo: origin + '/favicon-512.png' };

// ── Locale-aware URLs (mirrors src/localeRoutes.ts) ─────────────────────────
// English lives at the root, Spanish under /es. Every page is generated once per
// language so search engines can index the Spanish copy at its own URL.
const LANGS = ['en', 'es'];
const OG_LOCALE = { en: 'en_US', es: 'es_LA' };
const STATIC = {
  en: { disclaimer: 'Preliminary guidance is not an official credential evaluation, legal advice, or a guarantee of employment, admission, or licensing.', publicPages: 'Public pages', breadcrumb: 'Breadcrumb', otherLanguage: 'Español' },
  es: { disclaimer: 'La orientación preliminar no es una evaluación oficial de credenciales ni asesoría legal, y no garantiza empleo, admisión ni licencias.', publicPages: 'Páginas públicas', breadcrumb: 'Ruta de navegación', otherLanguage: 'English' },
};
const guideBySlug = slug => content.guides.find(g => g.slug === slug);
const guideSlug = (guide, lang) => (lang === 'es' && guide.es.slug) || guide.slug;
/** Site path (with trailing slash, as GitHub Pages serves directories) for an English route. */
function localPath(route, lang) {
  const match = /^\/guides\/([^/]+)$/.exec(route);
  const local = match ? `/guides/${guideSlug(guideBySlug(match[1]), lang)}` : route;
  const prefixed = lang === 'es' ? `/es${local === '/' ? '' : local}` : local;
  return prefixed === '/' ? '/' : `${prefixed}/`;
}
const localText = (page, lang) => (lang === 'es' ? { ...page, ...page.es } : page);

for (const [route, page] of Object.entries(pages)) {
  if (!page.es?.title || !page.es?.description || !page.es?.heading || !page.es?.body) throw new Error(`seo-pages.json: ${route} is missing Spanish title, description, heading or body`);
  if (page.guide && !guideBySlug(page.guide)) throw new Error(`seo-pages.json references unknown guide ${page.guide}`);
}

function breadcrumbs(items, lang) {
  return {
    html: `<nav aria-label="${STATIC[lang].breadcrumb}"><ol>${items.map(([name, href], i) => i === items.length - 1 ? `<li aria-current="page">${escape(name)}</li>` : `<li><a href="${href}">${escape(name)}</a></li>`).join('')}</ol></nav>`,
    ld: { '@type': 'BreadcrumbList', itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + href })) },
  };
}

function renderArticle(guide, lang) {
  const g = guide[lang];
  const ui = content.ui[lang];
  const updated = guide.updated ?? content.updated;
  const num = id => guide.sources.indexOf(id) + 1;
  const sections = g.sections.map(s => `<section id="${s.id}"><h2>${escape(s.heading)}</h2>${s.paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}`
    + (s.sourceRefs ? `<p>${ui.sources}: ${s.sourceRefs.map(r => `<a href="#source-${r}">[${num(r)}] ${escape(content.sources[r].publisher)}</a>`).join(', ')}</p>` : '')
    + (s.checklist ? `${s.checklistTitle ? `<h3>${escape(s.checklistTitle)}</h3>` : ''}<ul>${s.checklist.map(c => `<li>${escape(c)}</li>`).join('')}</ul>` : '')
    + '</section>').join('');
  const templates = g.templates ? `<section id="templates"><h2>${escape(g.templatesTitle)}</h2><p>${escape(g.templatesNote)}</p>${g.templates.map(t => `<figure><figcaption>${escape(t.label)}</figcaption><pre>${escape(t.lines.join('\n'))}</pre></figure>`).join('')}</section>` : '';
  const sources = `<section aria-labelledby="sources"><h2 id="sources">${ui.sources}</h2><p>${escape(ui.sourcesNote)}</p><ol>${guide.sources.map(id => { const s = content.sources[id]; return `<li id="source-${id}">${escape(s.publisher)}. <a href="${escape(s.url)}" rel="noopener noreferrer">${escape(s.title)}</a>. ${escape(s.scope[lang])}</li>`; }).join('')}</ol></section>`;
  const related = `<nav aria-labelledby="related"><h2 id="related">${ui.related}</h2><ul>${guide.related.map(r => `<li><a href="${localPath(`/guides/${r}`, lang)}">${escape(guideBySlug(r)[lang].title)}</a></li>`).join('')}<li><a href="${localPath('/guides', lang)}">${ui.allGuides}</a></li></ul></nav>`;
  return `<article><header><h1>${escape(g.title)}</h1><p>${escape(g.summary)}</p><p>${escape(g.readTime)} · ${ui.updated}: <time datetime="${updated}">${updated}</time></p></header>${sections}${templates}<p>${escape(ui.disclaimer)}</p>${sources}${related}</article>`;
}

const sitemapEntries = [];
for (const lang of LANGS) {
  const ui = content.ui[lang];
  const other = lang === 'en' ? 'es' : 'en';
  const publicNav = `<nav aria-label="${STATIC[lang].publicPages}">${Object.entries(pages).map(([link, info]) => `<a href="${localPath(link, lang)}">${escape(localText(info, lang).heading)}</a>`).join(' · ')}</nav>`;
  const cta = `<aside><h2>${escape(ui.ctaTitle)}</h2><p>${escape(ui.ctaBody)}</p><a href="${localPath('/', lang)}">${escape(ui.ctaButton)}</a></aside>`;
  for (const [route, page] of Object.entries(pages)) {
    const text = localText(page, lang);
    const here = localPath(route, lang);
    const url = origin + here;
    const alternates = Object.fromEntries(LANGS.map(l => [l, origin + localPath(route, l)]));
    const guide = page.guide ? guideBySlug(page.guide) : null;
    const lastmod = guide ? guide.updated ?? content.updated : page.guides ? content.guides.map(g => g.updated ?? content.updated).sort().at(-1) : null;
    sitemapEntries.push({ url, alternates, lastmod });
    const graph = [org, { '@type': 'WebSite', '@id': origin + '/#website', name: 'VerifED Global', url: origin + '/', inLanguage: ['en', 'es'] },
      { '@type': 'WebPage', '@id': url + '#webpage', url, name: text.title, description: text.description, isPartOf: { '@id': origin + '/#website' }, inLanguage: lang }];
    let body;
    if (guide) {
      const crumbs = breadcrumbs([[ui.home, localPath('/', lang)], [ui.nav, localPath('/guides', lang)], [guide[lang].title, here]], lang);
      graph.push(crumbs.ld, { '@type': 'Article', headline: guide[lang].title, description: text.description, url, mainEntityOfPage: { '@id': url + '#webpage' }, inLanguage: lang, dateModified: lastmod, author: { '@id': org['@id'] }, publisher: { '@id': org['@id'] }, citation: guide.sources.map(id => content.sources[id].url) });
      body = `${crumbs.html}${renderArticle(guide, lang)}${cta}`;
    } else if (page.guides === 'index') {
      const crumbs = breadcrumbs([[ui.home, localPath('/', lang)], [ui.nav, here]], lang);
      graph.push(crumbs.ld);
      body = `${crumbs.html}<h1>${escape(ui.indexTitle)}</h1><p>${escape(ui.indexIntro)}</p><ul>${content.guides.map(g => `<li><h2><a href="${localPath(`/guides/${g.slug}`, lang)}">${escape(g[lang].title)}</a></h2><p>${escape(g[lang].summary)}</p></li>`).join('')}</ul><p>${escape(ui.disclaimer)}</p>${cta}`;
    } else {
      body = `<h1>${escape(text.heading)}</h1><p>${escape(text.body)}</p><p>${STATIC[lang].disclaimer}</p>`;
    }
    const tags = `<title>${escape(text.title)}</title>
<meta name="description" content="${escape(text.description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
${LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${alternates[l]}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${alternates.en}">
<meta property="og:title" content="${escape(text.title)}">
<meta property="og:description" content="${escape(text.description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="${guide ? 'article' : 'website'}">
<meta property="og:site_name" content="VerifED Global">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
<meta property="og:locale:alternate" content="${OG_LOCALE[other]}">
<meta property="og:image" content="${origin}/favicon-512.png">
<meta property="og:image:alt" content="VerifED Global logo">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escape(text.title)}">
<meta name="twitter:description" content="${escape(text.description)}">
<meta name="twitter:image" content="${origin}/favicon-512.png">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>`;
    const html = shell.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
      .replace(/<title>[\s\S]*?<\/title>/g, '')
      .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '')
      .replace(/<link rel="canonical"[^>]*>/g, '')
      .replace('</head>', () => tags + '\n</head>')
      .replace('<div id="root"></div>', () => `<div id="root"><a href="#main-content">${escape(ui.skip)}</a><header><a href="${localPath('/', lang)}">VerifED Global</a> ${publicNav} <a href="${localPath(route, other)}" hreflang="${other}" lang="${other}">${STATIC[lang].otherLanguage}</a></header><main id="main-content">${body}</main></div>`);
    const dir = path.join(out, here);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), html);
  }
}
// Each URL lists every language version (itself included) so search engines pair them.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapEntries.map(e => `  <url><loc>${e.url}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}${LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${e.alternates[l]}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${e.alternates.en}"/></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(out, 'sitemap.xml'), sitemap);
// Keep the committed public sitemap in sync with the generated one.
await writeFile(path.join(root, 'public/sitemap.xml'), sitemap);
// Real HTTP 404 on GitHub Pages, without misleading homepage metadata.
await writeFile(path.join(out, '404.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | VerifED Global</title></head><body><main><h1>Page not found</h1><p><a href="/">Return to VerifED Global</a> · <a href="/guides/">Read the guides</a></p><h1 lang="es">Página no encontrada</h1><p lang="es"><a href="/es/">Volver a VerifED Global</a> · <a href="/es/guides/">Leer las guías</a></p></main></body></html>');
const adminHtml = shell.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow">').replace(/<link rel="canonical"[^>]*>/, '').replace(/<title>.*?<\/title>/, '<title>Admin | VerifED Global</title>');
// The admin view is reachable from both language roots; neither copy is indexable.
for (const dir of ['admin', 'es/admin']) {
  await mkdir(path.join(out, dir), { recursive: true });
  await writeFile(path.join(out, dir, 'index.html'), adminHtml);
}
