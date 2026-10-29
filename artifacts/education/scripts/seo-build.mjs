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
const ui = content.ui.en;
const org = { '@type': 'Organization', '@id': origin + '/#organization', name: 'VerifED Global', url: origin + '/', logo: origin + '/favicon-512.png' };
const disclaimer = '<p>Preliminary guidance is not an official credential evaluation, legal advice, or a guarantee of employment, admission, or licensing.</p>';
const publicNav = `<nav aria-label="Public pages">${Object.entries(pages).map(([link, info]) => `<a href="${link}">${escape(info.heading)}</a>`).join(' · ')}</nav>`;

function breadcrumbs(items) {
  return {
    html: `<nav aria-label="Breadcrumb"><ol>${items.map(([name, href], i) => i === items.length - 1 ? `<li aria-current="page">${escape(name)}</li>` : `<li><a href="${href}">${escape(name)}</a></li>`).join('')}</ol></nav>`,
    ld: { '@type': 'BreadcrumbList', itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + href })) },
  };
}

function renderArticle(guide) {
  const g = guide.en;
  const num = id => guide.sources.indexOf(id) + 1;
  const sections = g.sections.map(s => `<section id="${s.id}"><h2>${escape(s.heading)}</h2>${s.paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}`
    + (s.sourceRefs ? `<p>${ui.sources}: ${s.sourceRefs.map(r => `<a href="#source-${r}">[${num(r)}] ${escape(content.sources[r].publisher)}</a>`).join(', ')}</p>` : '')
    + (s.checklist ? `${s.checklistTitle ? `<h3>${escape(s.checklistTitle)}</h3>` : ''}<ul>${s.checklist.map(c => `<li>${escape(c)}</li>`).join('')}</ul>` : '')
    + '</section>').join('');
  const templates = g.templates ? `<section id="templates"><h2>${escape(g.templatesTitle)}</h2><p>${escape(g.templatesNote)}</p>${g.templates.map(t => `<figure><figcaption>${escape(t.label)}</figcaption><pre>${escape(t.lines.join('\n'))}</pre></figure>`).join('')}</section>` : '';
  const sources = `<section aria-labelledby="sources"><h2 id="sources">${ui.sources}</h2><p>${escape(ui.sourcesNote)}</p><ol>${guide.sources.map(id => { const s = content.sources[id]; return `<li id="source-${id}">${escape(s.publisher)}. <a href="${escape(s.url)}" rel="noopener noreferrer">${escape(s.title)}</a>. ${escape(s.scope.en)}</li>`; }).join('')}</ol></section>`;
  const related = `<nav aria-labelledby="related"><h2 id="related">${ui.related}</h2><ul>${guide.related.map(r => `<li><a href="/guides/${r}">${escape(content.guides.find(x => x.slug === r).en.title)}</a></li>`).join('')}<li><a href="/guides">${ui.allGuides}</a></li></ul></nav>`;
  return `<article><header><h1>${escape(g.title)}</h1><p>${escape(g.summary)}</p><p>${escape(g.readTime)} · ${ui.updated}: <time datetime="${content.updated}">${content.updated}</time></p></header>${sections}${templates}<p>${escape(ui.disclaimer)}</p>${sources}${related}</article>`;
}
const cta = `<aside><h2>${escape(ui.ctaTitle)}</h2><p>${escape(ui.ctaBody)}</p><a href="/">${escape(ui.ctaButton)}</a></aside>`;

for (const [route, page] of Object.entries(pages)) {
  const url = origin + route;
  const guide = page.guide ? content.guides.find(g => g.slug === page.guide) : null;
  if (page.guide && !guide) throw new Error(`seo-pages.json references unknown guide ${page.guide}`);
  const graph = [org, { '@type': 'WebSite', '@id': origin + '/#website', name: 'VerifED Global', url: origin + '/', inLanguage: ['en', 'es'] },
    { '@type': 'WebPage', '@id': url + '#webpage', url, name: page.title, description: page.description, isPartOf: { '@id': origin + '/#website' }, inLanguage: 'en' }];
  let body;
  if (guide) {
    const crumbs = breadcrumbs([[ui.home, '/'], [ui.nav, '/guides'], [guide.en.title, route]]);
    graph.push(crumbs.ld, { '@type': 'Article', headline: guide.en.title, description: page.description, url, mainEntityOfPage: { '@id': url + '#webpage' }, inLanguage: 'en', dateModified: content.updated, author: { '@id': org['@id'] }, publisher: { '@id': org['@id'] }, citation: guide.sources.map(id => content.sources[id].url) });
    body = `${crumbs.html}${renderArticle(guide)}${cta}`;
  } else if (page.guides === 'index') {
    const crumbs = breadcrumbs([[ui.home, '/'], [ui.nav, '/guides']]);
    graph.push(crumbs.ld);
    body = `${crumbs.html}<h1>${escape(ui.indexTitle)}</h1><p>${escape(ui.indexIntro)}</p><ul>${content.guides.map(g => `<li><h2><a href="/guides/${g.slug}">${escape(g.en.title)}</a></h2><p>${escape(g.en.summary)}</p></li>`).join('')}</ul><p>${escape(ui.disclaimer)}</p>${cta}`;
  } else {
    body = `<h1>${escape(page.heading)}</h1><p>${escape(page.body)}</p>${disclaimer}`;
  }
  const tags = `<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="${guide ? 'article' : 'website'}">
<meta property="og:site_name" content="VerifED Global">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${origin}/favicon-512.png">
<meta property="og:image:alt" content="VerifED Global logo">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escape(page.title)}">
<meta name="twitter:description" content="${escape(page.description)}">
<meta name="twitter:image" content="${origin}/favicon-512.png">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>`;
  const html = shell.replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace('</head>', tags + '\n</head>')
    .replace('<div id="root"></div>', () => `<div id="root"><a href="#main-content">Skip to main content</a><header><a href="/">VerifED Global</a> ${publicNav}</header><main id="main-content">${body}</main></div>`);
  const dir = route === '/' ? out : path.join(out, route);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html);
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.entries(pages).map(([route, p]) => `  <url><loc>${origin}${route}</loc>${p.guide || p.guides ? `<lastmod>${content.updated}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(out, 'sitemap.xml'), sitemap);
// Keep the committed public sitemap in sync with the generated one.
await writeFile(path.join(root, 'public/sitemap.xml'), sitemap);
// Real HTTP 404 on GitHub Pages, without misleading homepage metadata.
await writeFile(path.join(out, '404.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | VerifED Global</title></head><body><main><h1>Page not found</h1><p><a href="/">Return to VerifED Global</a> · <a href="/guides">Read the guides</a></p></main></body></html>');
await mkdir(path.join(out, 'admin'), { recursive: true });
await writeFile(path.join(out, 'admin/index.html'), shell.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow">').replace(/<link rel="canonical"[^>]*>/, '').replace(/<title>.*?<\/title>/, '<title>Admin | VerifED Global</title>'));
