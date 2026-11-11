import content from './guides/guides-content.json';

/**
 * Locale-aware public URLs. English lives at the root (`/about`), Spanish under
 * `/es` (`/es/about`). Guides may carry a translated Spanish slug. This module is
 * the single source of truth shared by the router, the language toggle and
 * <PageMetadata>; scripts/seo-build.mjs mirrors the same rules for static HTML.
 */
export type Lang = 'en' | 'es';
export const ORIGIN = 'https://verifed.co';
export const ES_PREFIX = '/es';

type GuideSlugs = { slug: string; es: { slug?: string } };
const guides = content.guides as GuideSlugs[];

/** Slug a guide uses in the given language. */
export function guideSlug(guide: GuideSlugs, lang: Lang): string {
  return lang === 'es' ? guide.es.slug ?? guide.slug : guide.slug;
}

/** Canonical (English) slug for a slug seen in either language, or undefined. */
export function canonicalGuideSlug(slug: string, lang: Lang): string | undefined {
  return guides.find((g) => guideSlug(g, lang) === slug)?.slug;
}

/** Splits a browser pathname (base already removed) into language + in-app route. */
export function splitLocale(pathname: string): { lang: Lang; route: string } {
  const path = pathname || '/';
  if (path === ES_PREFIX || path.startsWith(`${ES_PREFIX}/`)) {
    return { lang: 'es', route: path.slice(ES_PREFIX.length) || '/' };
  }
  return { lang: 'en', route: path };
}

const trim = (route: string) => (route.length > 1 ? route.replace(/\/+$/, '') : route) || '/';

/**
 * Language-neutral key for an in-app route: the English route used in
 * seo-pages.json. `/guides/<spanish-slug>` in Spanish maps to `/guides/<slug>`.
 */
export function canonicalRoute(route: string, lang: Lang): string {
  const clean = trim(route);
  const match = /^\/guides\/([^/]+)$/.exec(clean);
  if (!match) return clean;
  const slug = canonicalGuideSlug(match[1], lang);
  return slug ? `/guides/${slug}` : clean;
}

/** In-app route (relative to the language prefix) for a canonical route. */
export function localizedRoute(canonical: string, lang: Lang): string {
  const match = /^\/guides\/([^/]+)$/.exec(trim(canonical));
  if (!match) return trim(canonical);
  const guide = guides.find((g) => g.slug === match[1]);
  return guide ? `/guides/${guideSlug(guide, lang)}` : trim(canonical);
}

/** Site-absolute path for a canonical route in a language, e.g. `/es/about`. */
export function localizedPath(canonical: string, lang: Lang): string {
  const route = localizedRoute(canonical, lang);
  if (lang === 'en') return route;
  return route === '/' ? ES_PREFIX : `${ES_PREFIX}${route}`;
}

/** Published URL with the trailing slash GitHub Pages serves for directory pages. */
export function publicUrl(canonical: string, lang: Lang): string {
  const path = localizedPath(canonical, lang);
  return `${ORIGIN}${path === '/' ? '/' : `${path}/`}`;
}

/** Path to navigate to when switching the current page to the other language. */
export function switchLanguagePath(pathname: string): string {
  const { lang, route } = splitLocale(pathname);
  const target: Lang = lang === 'en' ? 'es' : 'en';
  return localizedPath(canonicalRoute(route, lang), target);
}
