/** GA4 events sent through the gtag snippet in index.html (G-TRY7JWJW4C).
 *  Never pass usernames, emails or anything else that identifies a person:
 *  Google's terms forbid personal data in analytics. */
type Params = Record<string, string | number | undefined>;

declare global {
  interface Window { gtag?: (command: 'event', name: string, params?: Params) => void }
}

export function track(name: string, params: Params = {}): void {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  try {
    window.gtag?.('event', name, clean);
  } catch {
    // Analytics must never break signup or navigation.
  }
}

/** GA4 recommended event; mark `sign_up` as a key event in GA4 to count conversions. */
export function trackSignUp(lang: string, country?: string, goal?: string): void {
  track('sign_up', { method: 'password', language: lang, signup_country: country, signup_goal: goal });
}

export function trackLogin(lang: string): void {
  track('login', { method: 'password', language: lang });
}

/** A click on a guide's "get started" button; `guide` is the guide slug, or "index". */
export function trackGuideCta(guide: string, lang: string): void {
  track('guide_cta_click', { guide, language: lang });
}
