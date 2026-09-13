import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchGridSearch } from './grid-api';

function mockFetchOnce(impl: (...args: unknown[]) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function mapsLiveResponse(items: unknown[], cost = 0.002) {
  return new Response(JSON.stringify({
    tasks: [{ status_code: 20000, cost, result: [{ items }] }],
  }), { status: 200 });
}

describe('geo-grid excludes sponsored/paid local-pack results', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops a paid ad and renumbers the remaining organic result to #1 (not #2)', async () => {
    mockFetchOnce(() => mapsLiveResponse([
      { type: 'local_pack', rank_group: 1, rank_absolute: 1, title: 'Sponsored Business', domain: 'ad.com', is_paid: true },
      { type: 'local_pack', rank_group: 2, rank_absolute: 2, title: 'Real Top Result', domain: 'target.com', is_paid: false },
    ]));

    const { results } = await fetchGridSearch('pizza', '40,-73', 1, 1, 'English', 'target.com', 'user', 'pass');
    expect(results[0].rank).toBe(1);
    expect(results[0].items).toHaveLength(1);
    expect(results[0].items?.[0].title).toBe('Real Top Result');
  });

  it('keeps a business\'s organic entry when it also has a separate paid entry, matching that organic rank', async () => {
    mockFetchOnce(() => mapsLiveResponse([
      { type: 'local_pack', rank_group: 1, rank_absolute: 1, title: 'Target Business (Ad)', domain: 'target.com', is_paid: true },
      { type: 'local_pack', rank_group: 2, rank_absolute: 2, title: 'Some Competitor', domain: 'other.com', is_paid: false },
      { type: 'local_pack', rank_group: 3, rank_absolute: 3, title: 'Target Business', domain: 'target.com', is_paid: false },
    ]));

    const { results } = await fetchGridSearch('pizza', '40,-73', 1, 1, 'English', 'target.com', 'user', 'pass');
    // Paid entry dropped, so organic order is [Some Competitor, Target Business] -> renumbered 1, 2.
    expect(results[0].rank).toBe(2);
    expect(results[0].items).toHaveLength(2);
    expect(results[0].items?.find((i) => i.is_target)?.rank_group).toBe(2);
  });

  it('returns a null rank when the target only appears as a paid ad with no organic presence', async () => {
    mockFetchOnce(() => mapsLiveResponse([
      { type: 'local_pack', rank_group: 1, rank_absolute: 1, title: 'Target Business', domain: 'target.com', is_paid: true },
      { type: 'local_pack', rank_group: 2, rank_absolute: 2, title: 'Someone Else', domain: 'other.com', is_paid: false },
    ]));

    const { results } = await fetchGridSearch('pizza', '40,-73', 1, 1, 'English', 'target.com', 'user', 'pass');
    expect(results[0].rank).toBeNull();
    expect(results[0].items).toHaveLength(1);
    expect(results[0].items?.[0].rank_group).toBe(1);
  });

  it('handles a grid point with only paid results as empty (no organic listings at all)', async () => {
    mockFetchOnce(() => mapsLiveResponse([
      { type: 'local_pack', rank_group: 1, rank_absolute: 1, title: 'Ad One', domain: 'ad1.com', is_paid: true },
      { type: 'local_pack', rank_group: 2, rank_absolute: 2, title: 'Ad Two', domain: 'ad2.com', is_paid: true },
    ]));

    const { results } = await fetchGridSearch('pizza', '40,-73', 1, 1, 'English', 'target.com', 'user', 'pass');
    expect(results[0].rank).toBeNull();
    expect(results[0].items).toEqual([]);
  });
});
