// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PROGRAMS } from './catalog';
import { catalogReviewQueue, reviewLink } from './catalogReview';

describe.skipIf(process.env.PROGRAM_LINK_REVIEW !== '1')('official program link review (opt in)', () => {
  it('reports overdue editorial reviews without changing checkedAt', () => {
    expect(catalogReviewQueue(PROGRAMS), 'Manually review official award, level and caveats before updating checkedAt').toEqual([]);
  });

  for (const url of new Set(PROGRAMS.flatMap(p => [p.url, p.sourceUrl]))) {
    it(url, async () => {
      const review = await reviewLink(url);
      // Redirects, throttling and network failures require a person, not automatic deletion.
      expect(review, JSON.stringify(review)).toMatchObject({ result: 'reachable' });
    }, 20_000);
  }
});
