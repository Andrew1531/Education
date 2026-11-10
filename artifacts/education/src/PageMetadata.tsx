import { useEffect } from 'react';
import { useLocation } from 'wouter';
import pages from '../seo-pages.json';
import { canonicalRoute, publicUrl, type Lang } from './localeRoutes';

type Text = { title: string; description: string };
type Page = Text & { heading: string; es?: Text };
const ORIGIN = 'https://verifed.co';
const LANGS: Lang[] = ['en', 'es'];
const OG_LOCALE: Record<Lang, string> = { en: 'en_US', es: 'es_LA' };

/** Client-side mirror of scripts/seo-build.mjs. Each language has its own URL
 *  (English at the root, Spanish under /es), so every indexable page gets a
 *  self-referencing canonical plus hreflang alternates for both languages. */
export function PageMetadata({ lang = 'en' }: { lang?: Lang }) {
  const [location] = useLocation();
  useEffect(() => {
    const route = canonicalRoute(location, lang);
    const page = (pages as Record<string, Page>)[route];
    const local = lang === 'es' && page?.es ? page.es : page;
    const title = local?.title ?? (route === '/admin' ? 'Admin | VerifED Global' : lang === 'es' ? 'Página no encontrada | VerifED Global' : 'Page not found | VerifED Global');
    const url = page ? publicUrl(route, lang) : `${ORIGIN}/`;
    document.title = title;
    document.documentElement.lang = lang;
    const set = (key: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let node = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!node) { node = document.createElement('meta'); node.setAttribute(attr, key); document.head.append(node); }
      node.content = content;
    };
    set('description', local?.description ?? '');
    set('robots', page ? 'index, follow' : 'noindex, nofollow');
    for (const prefix of ['og', 'twitter']) {
      set(`${prefix}:title`, title, prefix === 'og');
      set(`${prefix}:description`, local?.description ?? '', prefix === 'og');
      set(`${prefix}:image`, `${ORIGIN}/favicon-512.png`, prefix === 'og');
    }
    set('twitter:card', 'summary');
    set('og:url', url, true);
    set('og:locale', OG_LOCALE[lang], true);
    set('og:type', route.startsWith('/guides/') ? 'article' : 'website', true);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach(node => node.remove());
    if (page) {
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
      canonical.href = url;
      for (const [code, target] of [...LANGS.map(l => [l, l] as const), ['x-default', 'en'] as const]) {
        const alternate = document.createElement('link');
        alternate.rel = 'alternate';
        alternate.hreflang = code;
        alternate.href = publicUrl(route, target);
        document.head.append(alternate);
      }
    } else canonical?.remove();
    // Keep the richer prerendered structured data (Article, breadcrumbs) when it already
    // describes this URL; otherwise drop the previous route's data after client navigation.
    const schemas = [...document.head.querySelectorAll('script[type="application/ld+json"]')];
    const prerendered = page && schemas.some(node => node.textContent?.includes(`"url":"${url}"`));
    if (!prerendered) schemas.forEach(node => node.remove());
    if (page && !prerendered) {
      const schema = document.createElement('script');
      schema.type = 'application/ld+json';
      schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', url, name: title, description: local?.description, inLanguage: lang });
      document.head.append(schema);
    }
  }, [location, lang]);
  return null;
}
