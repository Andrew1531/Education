import { describe, it, expect } from 'vitest';
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
