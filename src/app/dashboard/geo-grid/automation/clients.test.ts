import { describe, it, expect } from 'vitest';
import type { GridSchedule } from '@/lib/db';
import { groupSchedulesByClient, schedulesForClient, clientUrl, normalizeClientName, arpTrend } from './clients';

let nextId = 1;
function sched(over: Partial<GridSchedule>): GridSchedule {
  return {
    id: nextId++, client: '', label: 'x', keyword: 'kw', target: 'Biz', center: '1,2', grid_size: 3, spacing_km: 1,
    language: 'English', queue_mode: 'standard', depth: 10, frequency: 'weekly', day_of_week: 1, day_of_month: null,
    time_of_day: '08:00', enabled: true, next_run_at: null, last_run_at: null, last_scan_id: null, last_status: null,
    last_error: null, created_at: 0, ...over,
  };
}

describe('groupSchedulesByClient', () => {
  it('groups case- and space-insensitively and keeps the first spelling', () => {
    const groups = groupSchedulesByClient([
      sched({ client: 'Arctic Pools and Spas', keyword: 'hot tubs' }),
      sched({ client: ' arctic  pools and spas ', keyword: 'pool service' }),
      sched({ client: 'Bright Dental' }),
    ]);
    expect(groups.map((g) => [g.name, g.schedules.length])).toEqual([['Arctic Pools and Spas', 2], ['Bright Dental', 1]]);
  });

  it('falls back to the business name when a schedule has no client', () => {
    const groups = groupSchedulesByClient([sched({ client: '', target: 'Acme Roofing' })]);
    expect(groups[0].name).toBe('Acme Roofing');
  });

  it('sums status and picks the soonest next run among active schedules only', () => {
    const [g] = groupSchedulesByClient([
      sched({ client: 'A', next_run_at: 500, last_run_at: 100, last_status: 'failed' }),
      sched({ client: 'A', next_run_at: 300, last_run_at: 200, last_status: 'running' }),
      sched({ client: 'A', enabled: false, next_run_at: 100, last_status: 'success' }),
    ]);
    expect(g).toMatchObject({ activeCount: 2, nextRunAt: 300, lastRunAt: 200, failedCount: 1, runningCount: 1 });
  });
});

describe('schedulesForClient', () => {
  it('matches the same way the grouping does', () => {
    const all = [sched({ client: 'Arctic Pools' }), sched({ client: 'ARCTIC POOLS ' }), sched({ client: 'Other' })];
    expect(schedulesForClient(all, 'arctic pools')).toHaveLength(2);
  });
});

describe('client names', () => {
  it('tidies spacing and builds an encoded link', () => {
    expect(normalizeClientName('  Arctic   Pools & Spas ')).toBe('Arctic Pools & Spas');
    expect(clientUrl('Arctic Pools & Spas')).toBe('/dashboard/geo-grid/automation/client?name=Arctic%20Pools%20%26%20Spas');
  });
});

describe('arpTrend', () => {
  const run = (status: 'done' | 'pending' | 'error', avgRank: number | null, ts = 0) => ({
    ts, status, summary: { totalPoints: 9, foundCount: 9, avgRank, top3Count: 0, ato: 0 },
  });
  it('compares the latest finished run with the one before, skipping running and partial runs', () => {
    expect(arpTrend([run('pending', 1, 4), run('done', 5, 3), run('error', 9, 2), run('done', 5.4, 1)]))
      .toEqual({ arp: 5, previous: 5.4, improvement: 0.4, ts: 3, olderRun: true });
    expect(arpTrend([run('done', 5, 3)])!.olderRun).toBe(false);
  });
  it('reports a worse rank as a negative improvement', () => {
    expect(arpTrend([run('done', 6.2), run('done', 5.0)])!.improvement).toBe(-1.2);
  });
  it('has no comparison for a first run or when the business was not found', () => {
    expect(arpTrend([run('done', 3)])).toMatchObject({ arp: 3, previous: null, improvement: null });
    expect(arpTrend([run('done', null), run('done', 3)])!.improvement).toBeNull();
    expect(arpTrend([run('pending', null)])).toBeNull();
  });
});
