import { useEffect } from 'react';
import { useLocation } from 'wouter';
import pages from '../seo-pages.json';

type Page = { title: string; description: string; heading: string; es?: { title: string; description: string } };
const ORIGIN = 'https://verifed.co';

/** Client-side mirror of scripts/seo-build.mjs. Spanish shares the English URL (no
 *  separate /es routes), so we localise title/description and <html lang> only —
 *  no hreflang alternates are emitted. */
export function PageMetadata({ lang = 'en' }: { lang?: 'en' | 'es' }) {
  const [location] = useLocation();
  useEffect(() => {
    const route = location.replace(/\/$/, '') || '/';
    const page = (pages as Record<string, Page>)[route];
    const local = lang === 'es' && page?.es ? page.es : page;
    const title = local?.title ?? (route === '/admin' ? 'Admin | VerifED Global' : 'Page not found | VerifED Global');
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
    set('og:url', `${ORIGIN}${route}`, true);
    set('og:type', route.startsWith('/guides/') ? 'article' : 'website', true);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (page) {
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
      canonical.href = `${ORIGIN}${route}`;
    } else canonical?.remove();
    // Do not leave a previous route's structured data attached after client navigation.
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach(node => node.remove());
    if (page) {
      const schema = document.createElement('script');
      schema.type = 'application/ld+json';
      schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', url: `${ORIGIN}${route}`, name: title, description: local?.description, inLanguage: lang });
      document.head.append(schema);
    }
  }, [location, lang]);
  return null;
}
