import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchGridSearch, postGridTasksQueue, stableGridId } from './grid-api';

function sentBodies(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.flatMap(([, init]) => JSON.parse((init as RequestInit).body as string) as Array<Record<string, unknown>>);
}

describe('geo-grid results depth (Top 10 / Top 20)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the chosen depth on the live endpoint, and defaults to 20', async () => {
    const live = () => new Response(JSON.stringify({ tasks: [{ status_code: 20000, cost: 0.002, result: [{ items: [] }] }] }), { status: 200 });
    const fetchMock = vi.fn(live);
    vi.stubGlobal('fetch', fetchMock);

    await fetchGridSearch('pizza', '40,-73', 1, 1, 'English', 'target.com', 'u', 'p', 10);
    await fetchGridSearch('pizza', '40,-73', 1, 1, 'English', 'target.com', 'u', 'p');
    expect(sentBodies(fetchMock).map((b) => b.depth)).toEqual([10, 20]);
  });

  it('sends the chosen depth on queued tasks, alongside the standard-queue priority', async () => {
    const queued = () => new Response(JSON.stringify({ tasks: [{ id: 't1', cost: 0.0006 }] }), { status: 200 });
    const fetchMock = vi.fn(queued);
    vi.stubGlobal('fetch', fetchMock);

    await postGridTasksQueue('pizza', '40,-73', 1, 1, 'English', 'u', 'p', 'standard', 10);
    await postGridTasksQueue('pizza', '40,-73', 1, 1, 'English', 'u', 'p', 'priority');
    const bodies = sentBodies(fetchMock);
    expect(bodies.map((b) => b.depth)).toEqual([10, 20]);
    expect(bodies.map((b) => b.priority)).toEqual([1, 2]);
  });

  it('keeps a Top 10 scan and a Top 20 scan of the same area from sharing an id', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    const args = ['pizza', '40,-73', 11, 1.6, 'target.com', 'standard'] as const;
    expect(stableGridId(...args, 10)).not.toBe(stableGridId(...args, 20));
    expect(stableGridId(...args)).toBe(stableGridId(...args, 20));
    vi.useRealTimers();
  });
});
