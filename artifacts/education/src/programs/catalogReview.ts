import type { ProgramRecord } from './catalog';

/** Reachability never proves that the award or its admissions rules are unchanged. */
export const REVIEW_INTERVAL_DAYS = 180;
const DAY = 86_400_000;

export function reviewDue(checkedAt: string, now = new Date()): boolean {
  const date = new Date(`${checkedAt}T00:00:00Z`);
  return !/^\d{4}-\d{2}-\d{2}$/.test(checkedAt) ||
    !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== checkedAt ||
    date.getTime() > now.getTime() || now.getTime() - date.getTime() >= REVIEW_INTERVAL_DAYS * DAY;
}

export interface LinkReview {
  url: string;
  finalUrl?: string;
  status?: number;
  result: 'reachable' | 'redirected' | 'broken' | 'unconfirmed';
}

/** Run only from the maintainer check, not from visitors' browsers. */
export async function reviewLink(url: string, fetcher: typeof fetch = fetch): Promise<LinkReview> {
  try {
    const response = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    // We only need headers; do not retain large catalog bodies.
    await response.body?.cancel();
    const result = response.status === 404 || response.status === 410 ? 'broken'
      : !response.ok ? 'unconfirmed'
      : response.redirected ? 'redirected' : 'reachable';
    return { url, finalUrl: response.url || url, status: response.status, result };
  } catch {
    return { url, result: 'unconfirmed' };
  }
}

export function catalogReviewQueue(programs: readonly ProgramRecord[], now = new Date()): string[] {
  return programs.filter(p => reviewDue(p.checkedAt, now)).map(p => p.id);
}
