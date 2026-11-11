import { describe, it, expect } from 'vitest';
import content from './guides/guides-content.json';
import { canonicalRoute, localizedPath, publicUrl, splitLocale, switchLanguagePath } from './localeRoutes';

describe('locale routes', () => {
  it('detects Spanish only under the /es prefix', () => {
    expect(splitLocale('/')).toEqual({ lang: 'en', route: '/' });
    expect(splitLocale('/es')).toEqual({ lang: 'es', route: '/' });
    expect(splitLocale('/es/')).toEqual({ lang: 'es', route: '/' });
    expect(splitLocale('/es/about')).toEqual({ lang: 'es', route: '/about' });
    expect(splitLocale('/essay')).toEqual({ lang: 'en', route: '/essay' });
  });
  it('switches language without losing the page', () => {
    expect(switchLanguagePath('/')).toBe('/es');
    expect(switchLanguagePath('/es')).toBe('/');
    expect(switchLanguagePath('/about')).toBe('/es/about');
    expect(switchLanguagePath('/es/how-it-works/')).toBe('/how-it-works');
    expect(switchLanguagePath('/guides')).toBe('/es/guides');
  });
  it('maps every guide between its English and Spanish slug in both directions', () => {
    for (const g of content.guides) {
      const en = `/guides/${g.slug}`;
      const es = localizedPath(en, 'es');
      expect(es.startsWith('/es/guides/')).toBe(true);
      expect(switchLanguagePath(en)).toBe(es);
      expect(switchLanguagePath(es)).toBe(en);
      expect(canonicalRoute(es.slice(3), 'es')).toBe(en);
    }
  });
  it('gives every guide a unique slug per language', () => {
    const en = content.guides.map((g) => g.slug);
    const es = content.guides.map((g) => (g.es as { slug?: string }).slug ?? g.slug);
    expect(new Set(en).size).toBe(en.length);
    expect(new Set(es).size).toBe(es.length);
    for (const slug of [...en, ...es]) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('publishes trailing-slash URLs that match the generated directories', () => {
    expect(publicUrl('/', 'en')).toBe('https://verifed.co/');
    expect(publicUrl('/', 'es')).toBe('https://verifed.co/es/');
    expect(publicUrl('/about', 'es')).toBe('https://verifed.co/es/about/');
  });
});
