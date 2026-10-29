import { useEffect } from 'react';
import { useLocation } from 'wouter';
import pages from '../seo-pages.json';

export function PageMetadata() {
  const [location] = useLocation();
  useEffect(() => {
    const route = location.replace(/\/$/, '') || '/';
    const page = pages[route as keyof typeof pages];
    const title = page?.title ?? (route === '/admin' ? 'Admin | VerifED Global' : 'Page not found | VerifED Global');
    document.title = title;
    const set = (key: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let node = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!node) { node = document.createElement('meta'); node.setAttribute(attr, key); document.head.append(node); }
      node.content = content;
    };
    set('description', page?.description ?? '');
    set('robots', page ? 'index, follow' : 'noindex, nofollow');
    for (const prefix of ['og', 'twitter']) {
      set(`${prefix}:title`, title, prefix === 'og');
      set(`${prefix}:description`, page?.description ?? '', prefix === 'og');
      set(`${prefix}:image`, 'https://verifed.co/favicon-512.png', prefix === 'og');
    }
    set('twitter:card', 'summary');
    set('og:url', `https://verifed.co${route}`, true);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (page) {
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
      canonical.href = `https://verifed.co${route}`;
    } else canonical?.remove();
    // Do not leave a previous route's structured data attached after client navigation.
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach(node => node.remove());
    if (page) {
      const schema = document.createElement('script');
      schema.type = 'application/ld+json';
      schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', url: `https://verifed.co${route}`, name: page.title, description: page.description });
      document.head.append(schema);
    }
  }, [location]);
  return null;
}
