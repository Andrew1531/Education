// Renders the 1200×630 share images in public/og (one per guide and language,
// plus one for the rest of the site) with headless Chrome.
//
//   node scripts/og-images.mjs
//
// Run it after adding a guide or changing a guide title, then commit public/og.
// Set CHROME_PATH if Chrome is not in a standard location.
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public/og');
const content = JSON.parse(await readFile(path.join(root, 'src/guides/guides-content.json'), 'utf8'));
const pages = JSON.parse(await readFile(path.join(root, 'seo-pages.json'), 'utf8'));

const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && existsSync(p));
if (!chrome) throw new Error('og-images: Chrome not found; set CHROME_PATH');

const escape = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const TEXT = {
  en: { guide: 'Guide', profession: 'Licensed professions', country: name => `Degree from ${name}`, footer: 'Free guides that cite their sources' },
  es: { guide: 'Guía', profession: 'Profesiones reguladas', country: name => `Título de ${name}`, footer: 'Guías gratuitas que citan sus fuentes' },
};

function label(guide, lang) {
  if (!guide) return null;
  if (guide.country) return TEXT[lang].country(content.countries[guide.country][lang]);
  return guide.profession ? TEXT[lang].profession : TEXT[lang].guide;
}

function html(title, chip, lang) {
  const size = title.length <= 50 ? 72 : title.length <= 75 ? 60 : 52;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@500;600;700&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#EEF0FF;font-family:Figtree,system-ui,sans-serif;color:#0F172A;padding:64px 72px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:34px;letter-spacing:-0.03em}
.brand span{color:#5B4FE9}
.chip{background:#5B4FE9;color:#FCFCFF;font-weight:700;font-size:24px;padding:10px 22px;border-radius:999px}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:${size}px;line-height:1.05;letter-spacing:-0.035em;margin-top:auto;max-width:1020px}
.foot{margin-top:40px;display:flex;align-items:center;gap:18px;font-size:26px;font-weight:600;color:#3F35C2}
.bar{width:72px;height:8px;border-radius:8px;background:#5B4FE9}
</style></head><body>
<div class="top"><div class="brand">Verif<span>ED</span> Global</div>${chip ? `<div class="chip">${escape(chip)}</div>` : ''}</div>
<h1>${escape(title)}</h1>
<div class="foot"><div class="bar"></div>verifed.co · ${escape(TEXT[lang].footer)}</div>
</body></html>`;
}

await mkdir(out, { recursive: true });
const tmp = await mkdtemp(path.join(tmpdir(), 'og-'));
try {
  for (const lang of ['en', 'es']) {
    const site = lang === 'es' ? pages['/'].es.heading : pages['/'].heading;
    for (const guide of [null, ...content.guides]) {
      const name = `${guide ? guide.slug : 'site'}-${lang}`;
      const page = path.join(tmp, `${name}.html`);
      await writeFile(page, html(guide ? guide[lang].title : site, label(guide, lang), lang));
      execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630',
        '--virtual-time-budget=8000', `--user-data-dir=${path.join(tmp, 'profile')}`, `--screenshot=${path.join(out, `${name}.png`)}`, pathToFileURL(page).href], { stdio: 'ignore' });
      console.log(`public/og/${name}.png`);
    }
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
