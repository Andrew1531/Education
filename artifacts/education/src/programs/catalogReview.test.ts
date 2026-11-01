import { describe, it, expect, vi } from 'vitest';
import { PROGRAMS } from './catalog';
import { catalogReviewQueue, reviewDue, reviewLink } from './catalogReview';

describe('editorial review freshness', () => {
  const now = new Date('2026-10-31T00:00:00Z');
  it('flags the 180-day boundary, invalid dates and future dates', () => {
    expect(reviewDue('2026-05-05', now)).toBe(false);
    expect(reviewDue('2026-05-04', now)).toBe(true);
    for (const date of ['bad', '2026-02-30', '2026-11-01', '']) expect(reviewDue(date, now)).toBe(true);
  });
  it('returns ids needing manual review without refreshing dates', () => {
    const p = { ...PROGRAMS[0], checkedAt: '2025-01-01' };
    expect(catalogReviewQueue([p], now)).toEqual([p.id]);
    expect(p.checkedAt).toBe('2025-01-01');
  });
});

describe('link review', () => {
  const url = 'https://catalog.example.edu/award/';
  it.each([
    [200, false, 'reachable'], [200, true, 'redirected'],
    [404, false, 'broken'], [410, false, 'broken'],
    [403, false, 'unconfirmed'], [429, false, 'unconfirmed'], [503, false, 'unconfirmed'],
  ])('classifies HTTP %s redirected=%s as %s', async (status, redirected, result) => {
    const cancel = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({
      status, redirected, ok: status === 200, url, body: { cancel },
    });
    expect(await reviewLink(url, fetcher)).toMatchObject({ result, status });
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'follow', signal: expect.any(AbortSignal) }));
    expect(cancel).toHaveBeenCalled();
  });
  it('does not confuse a network timeout with a removed program', async () => {
    expect(await reviewLink(url, vi.fn().mockRejectedValue(new Error('timeout'))))
      .toEqual({ url, result: 'unconfirmed' });
  });
});
