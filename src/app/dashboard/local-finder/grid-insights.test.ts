import { describe, it, expect } from 'vitest';
import type { GridPoint, GridLocalItem } from '@/lib/db';
import { computeGridSummary, computeCompetitors } from './grid-insights';

function point(rank: number | null, items: GridLocalItem[] = []): GridPoint {
  return { row: 0, col: 0, rank, items };
}

function competitorItem(overrides: Partial<GridLocalItem> = {}): GridLocalItem {
  return {
    rank_group: 5,
    title: 'Some Competitor',
    is_target: false,
    ...overrides,
  };
}

describe('computeGridSummary — Coverage', () => {
  it('is 0% when nothing is found', () => {
    const results = [point(null), point(null), point(null)];
    expect(computeGridSummary(results).coverage).toBe(0);
  });

  it('is 100% when every point is found', () => {
    const results = [point(1), point(5), point(20)];
    expect(computeGridSummary(results).coverage).toBe(100);
  });

  it('cannot exceed 100%', () => {
    const results = Array.from({ length: 10 }, () => point(1));
    expect(computeGridSummary(results).coverage).toBeLessThanOrEqual(100);
  });

  it('uses the total grid point count as the denominator, matching the [7,8,11,15,null] example (80%)', () => {
    const results = [point(7), point(8), point(11), point(15), point(null)];
    expect(computeGridSummary(results).coverage).toBeCloseTo(80, 5);
  });

  it('matches the 11x11 grid example: 75/121 found = 61.98%', () => {
    const results = [
      ...Array.from({ length: 75 }, () => point(5)),
      ...Array.from({ length: 46 }, () => point(null)),
    ];
    expect(results.length).toBe(121);
    expect(computeGridSummary(results).coverage).toBeCloseTo(61.983471, 5);
  });
});

describe('computeGridSummary — ARP', () => {
  it('averages only the numeric found ranks, ignoring null points, matching the spec example (10.25)', () => {
    const results = [point(7), point(8), point(11), point(15), point(null)];
    expect(computeGridSummary(results).arp).toBe(10.25);
  });

  it('ignores null/not-found points entirely (not counted as 0)', () => {
    const withNulls = computeGridSummary([point(10), point(null), point(null)]).arp;
    const withoutNulls = computeGridSummary([point(10)]).arp;
    expect(withNulls).toBe(withoutNulls);
    expect(withNulls).toBe(10);
  });

  it('returns null (not 0) when the business is not found anywhere', () => {
    const results = [point(null), point(null), point(null)];
    expect(computeGridSummary(results).arp).toBeNull();
  });

  it('calculates decimals correctly, matching the second spec example (10.6)', () => {
    const results = [point(8), point(7), point(11), point(15), point(12)];
    expect(computeGridSummary(results).arp).toBe(10.6);
  });
});

describe('computeGridSummary — SoLV', () => {
  it('counts rank 1', () => {
    expect(computeGridSummary([point(1), point(null)]).solv).toBe(50);
  });

  it('counts rank 2', () => {
    expect(computeGridSummary([point(2), point(null)]).solv).toBe(50);
  });

  it('counts rank 3', () => {
    expect(computeGridSummary([point(3), point(null)]).solv).toBe(50);
  });

  it('does not count rank 4', () => {
    expect(computeGridSummary([point(4), point(null)]).solv).toBe(0);
  });

  it('does not count rank 20', () => {
    expect(computeGridSummary([point(20), point(null)]).solv).toBe(0);
  });

  it('does not count null', () => {
    expect(computeGridSummary([point(null), point(null)]).solv).toBe(0);
  });

  it('is 0% with zero top-3 points', () => {
    const results = [point(4), point(5), point(null)];
    expect(computeGridSummary(results).solv).toBe(0);
  });

  it('is 100% when every point is top-3', () => {
    const results = [point(1), point(2), point(3)];
    expect(computeGridSummary(results).solv).toBe(100);
  });

  it('uses total grid points (not just found points) as the denominator — not-found points stay in the denominator', () => {
    // 2 top-3 out of 5 total points (one of the other 3 is not-found) — matches the [1,2,7,11,null] example (40%)
    const results = [point(1), point(2), point(7), point(11), point(null)];
    expect(computeGridSummary(results).solv).toBeCloseTo(40, 5);
  });

  it('matches the 11x11 grid example: 20/121 top-3 = 16.53%', () => {
    const results = [
      ...Array.from({ length: 20 }, () => point(2)),
      ...Array.from({ length: 101 }, () => point(10)),
    ];
    expect(results.length).toBe(121);
    expect(computeGridSummary(results).solv).toBeCloseTo(16.528926, 5);
  });
});

describe('IMPORTANT EXAMPLE from spec: [8, 7, 11, 15, 12]', () => {
  const results = [point(8), point(7), point(11), point(15), point(12)];
  const summary = computeGridSummary(results);

  it('Coverage = 100%', () => {
    expect(summary.coverage).toBe(100);
  });

  it('ARP = 10.6', () => {
    expect(summary.arp).toBe(10.6);
  });

  it('SoLV = 0% (no top-3 ranks present)', () => {
    expect(summary.solv).toBe(0);
  });
});

describe('11x11 grid', () => {
  it('has totalPoints = 121', () => {
    const results = Array.from({ length: 121 }, () => point(null));
    expect(computeGridSummary(results).totalPoints).toBe(121);
  });
});

describe('computeCompetitors — duplicate-within-a-point bug', () => {
  it('counts a duplicate competitor result at one grid point only once', () => {
    const dup = competitorItem({ cid: '999', title: 'Dream Painting', rank_group: 2 });
    const results: GridPoint[] = [
      point(5, [dup, { ...dup, rank_group: 3 }]), // same cid appears twice within this single point
    ];
    const competitors = computeCompetitors(results);
    expect(competitors).toHaveLength(1);
    expect(competitors[0].appearances).toBe(1);
  });

  it('never lets a competitor point count exceed totalPoints, even with duplicates at every point', () => {
    const dup = competitorItem({ cid: '999', title: 'Dream Painting' });
    const results: GridPoint[] = Array.from({ length: 121 }, () =>
      point(5, [dup, { ...dup }, { ...dup }]), // 3 duplicate entries per point
    );
    const competitors = computeCompetitors(results);
    expect(competitors[0].appearances).toBeLessThanOrEqual(121);
    expect(competitors[0].appearances).toBe(121);
  });

  it('prefers cid over name when grouping the same business across points', () => {
    const results: GridPoint[] = [
      point(1, [competitorItem({ cid: '42', title: 'Dream Painting LLC' })]),
      point(2, [competitorItem({ cid: '42', title: 'Dream Painting' })]), // same cid, slightly different title
    ];
    const competitors = computeCompetitors(results);
    expect(competitors).toHaveLength(1);
    expect(competitors[0].appearances).toBe(2);
  });

  it('excludes the target business from competitor counts', () => {
    const results: GridPoint[] = [
      point(1, [competitorItem({ is_target: true, title: 'Paint Denver' })]),
    ];
    expect(computeCompetitors(results)).toHaveLength(0);
  });
});

describe('computeCompetitors — per-competitor Coverage/ARP/SoLV', () => {
  it('computes the same Coverage/ARP/SoLV definitions as the target, using the competitor\'s own ranks', () => {
    // Competitor appears (in range 1-20) at 2 of 4 points, one of which is top-3.
    const results: GridPoint[] = [
      point(1, [competitorItem({ cid: '1', rank_group: 1 })]),
      point(null, [competitorItem({ cid: '1', rank_group: 9 })]),
      point(null, []),
      point(null, []),
    ];
    const [c] = computeCompetitors(results);
    expect(c.coverage).toBe(50); // 2/4
    expect(c.arp).toBe(5); // (1+9)/2
    expect(c.solv).toBe(25); // 1/4 top-3
  });

  it('returns arp = null for a competitor with zero in-range ranks', () => {
    const results: GridPoint[] = [
      point(null, [competitorItem({ cid: '1', rank_group: 21 })]),
    ];
    const [c] = computeCompetitors(results);
    expect(c.arp).toBeNull();
  });
});

describe('computeGridSummary — foundCount matches Coverage numerator', () => {
  it('excludes out-of-range ranks (>20) from foundCount, keeping it consistent with the Coverage %', () => {
    const results = [point(5), point(21), point(22), point(null)];
    const summary = computeGridSummary(results);
    expect(summary.foundCount).toBe(1);
    expect(summary.coverage).toBe(25); // 1/4, matches foundCount/totalPoints exactly
  });
});
