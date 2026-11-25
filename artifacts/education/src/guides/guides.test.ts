import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import content from './guides-content.json';
import pages from '../../seo-pages.json';

const all = (o: unknown): string => JSON.stringify(o);
const p = pages as Record<string, { title: string; description: string; heading: string; body: string; guide?: string; es?: { title: string; description: string; heading: string; body: string } }>;

describe('guides content', () => {
  it('every guide has a public route with matching metadata in both languages', () => {
    for (const g of content.guides) {
      const page = p[`/guides/${g.slug}`];
      expect(page?.guide).toBe(g.slug);
      expect(page.title).toBe(g.en.seoTitle);
      expect(page.es?.title).toBe(g.es.seoTitle);
      expect(g.en.sections.length).toBe(g.es.sections.length);
      expect(g.en.description.length).toBeLessThanOrEqual(165);
    }
    expect(p['/guides']).toBeTruthy();
  });
  it('gives every public page complete Spanish metadata for its /es URL', () => {
    for (const [route, page] of Object.entries(p)) {
      for (const key of ['title', 'description', 'heading', 'body'] as const) expect(page.es?.[key], `${route} es.${key}`).toBeTruthy();
      expect(page.es!.title).not.toBe(page.title);
      expect(page.es!.description.length, route).toBeLessThanOrEqual(165);
    }
  });
  it('keeps section ids, source references and related guides consistent', () => {
    const slugs = content.guides.map((g) => g.slug);
    for (const g of content.guides) {
      expect(g.en.sections.map((s) => s.id)).toEqual(g.es.sections.map((s) => s.id));
      for (const lang of ['en', 'es'] as const) {
        for (const s of g[lang].sections as { sourceRefs?: string[] }[]) for (const ref of s.sourceRefs ?? []) expect(g.sources, `${g.slug} ${ref}`).toContain(ref);
      }
      for (const id of g.sources) expect(Object.keys(content.sources)).toContain(id);
      for (const r of g.related) expect(slugs).toContain(r);
    }
  });
  it('keeps every page title short enough not to be truncated in search results', () => {
    for (const [route, page] of Object.entries(p)) {
      expect(page.title.length, route).toBeLessThanOrEqual(60);
      expect(page.es!.title.length, `${route} es`).toBeLessThanOrEqual(60);
    }
  });
  it('gives every country guide a matching FAQ in both languages, citing its own sources', () => {
    for (const g of content.guides as { slug: string; country?: string; sources: string[]; en: { faq?: { q: string; a: string; sourceRefs?: string[] }[] }; es: { faq?: { q: string; a: string; sourceRefs?: string[] }[] } }[]) {
      if (!g.country) continue;
      expect(g.en.faq?.length, g.slug).toBeGreaterThanOrEqual(4);
      expect(g.es.faq?.length, g.slug).toBe(g.en.faq!.length);
      for (const lang of ['en', 'es'] as const) for (const f of g[lang].faq!) {
        expect(f.q.endsWith('?'), `${g.slug} ${f.q}`).toBe(true);
        expect(f.sourceRefs?.length, `${g.slug} ${f.q}`).toBeGreaterThan(0);
        for (const r of f.sourceRefs!) expect(g.sources, `${g.slug} ${r}`).toContain(r);
      }
    }
  });
  it('links country and profession guides to each other with complete labels', () => {
    const countries = content.countries as Record<string, { en: string; es: string }>;
    const guides = content.guides as { slug: string; country?: string; profession?: string; published?: string; updated?: string; en: { countryLink?: string }; es: { countryLink?: string } }[];
    expect(guides.filter((g) => g.profession).length).toBeGreaterThan(0);
    for (const g of guides) {
      if (g.country) expect(countries[g.country], g.slug).toBeTruthy();
      if (g.profession) for (const lang of ['en', 'es'] as const) expect(g[lang].countryLink, `${g.slug} ${lang}`).toContain('{country}');
      expect(g.published, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.published! <= (g.updated ?? content.updated), g.slug).toBe(true);
    }
    for (const lang of ['en', 'es'] as const) expect(content.ui[lang].byCountryLink).toContain('{country}');
  });
  it('has a share image for every guide and the rest of the site in both languages', () => {
    for (const lang of ['en', 'es']) for (const name of ['site', ...content.guides.map((g) => g.slug)]) {
      expect(existsSync(fileURLToPath(new URL(`../../public/og/${name}-${lang}.png`, import.meta.url))), `${name}-${lang}`).toBe(true);
    }
  });
  it('cites only defined https sources', () => {
    for (const g of content.guides) for (const id of g.sources) expect(content.sources[id as keyof typeof content.sources].url).toMatch(/^https:\/\//);
  });
  it('contains no emojis, guarantees or rankings', () => {
    const text = all(content);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(/guaranteed|we guarantee|ranked|#1|best provider/i);
  });
  it('labels resume templates as illustrative placeholders', () => {
    const g = content.guides.find((x) => x.slug === 'foreign-degree-on-resume')!;
    expect(g.en.templatesNote).toMatch(/not real people, not user results/);
    for (const t of g.en.templates!) expect(t.lines.join(' ')).toMatch(/\[/);
  });
});
