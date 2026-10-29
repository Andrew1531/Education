import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist/public');
const pages = JSON.parse(await readFile(path.join(root, 'seo-pages.json'), 'utf8'));
const origin = 'https://verifed.co';
const shell = await readFile(path.join(out, 'index.html'), 'utf8');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const [route, page] of Object.entries(pages)) {
  const url = origin + route;
  const tags = `<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VerifED Global">
<meta property="og:image" content="${origin}/favicon-512.png">
<meta property="og:image:alt" content="VerifED Global logo">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escape(page.title)}">
<meta name="twitter:description" content="${escape(page.description)}">
<meta name="twitter:image" content="${origin}/favicon-512.png">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Organization', '@id': origin + '/#organization', name: 'VerifED Global', url: origin + '/', logo: origin + '/favicon-512.png' },
      { '@type': 'WebSite', '@id': origin + '/#website', name: 'VerifED Global', url: origin + '/', inLanguage: ['en', 'es'] },
      { '@type': 'WebPage', '@id': url + '#webpage', url, name: page.title, description: page.description, isPartOf: { '@id': origin + '/#website' } }
    ]
  })}</script>`;
  const html = shell.replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace('</head>', tags + '\n</head>')
    .replace('<div id="root"></div>', `<div id="root"><main><h1>${escape(page.heading)}</h1><p>${escape(page.body)}</p><p>Preliminary guidance is not an official credential evaluation, legal advice, or a guarantee of employment, admission, or licensing.</p><nav aria-label="Public pages">${Object.entries(pages).map(([link, info]) => `<a href="${link}">${escape(info.heading)}</a>`).join(' · ')}</nav></main></div>`);
  const dir = route === '/' ? out : path.join(out, route);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html);
}
const urls = Object.keys(pages).map(route => `  <url><loc>${origin}${route}</loc></url>`).join('\n');
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
// Real HTTP 404 on GitHub Pages, without misleading homepage metadata.
await writeFile(path.join(out, '404.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found | VerifED Global</title></head><body><h1>Page not found</h1><a href="/">Return to VerifED Global</a></body></html>');
await mkdir(path.join(out, 'admin'), { recursive: true });
await writeFile(path.join(out, 'admin/index.html'), shell.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow">').replace(/<link rel="canonical"[^>]*>/, '').replace(/<title>.*?<\/title>/, '<title>Admin | VerifED Global</title>'));
