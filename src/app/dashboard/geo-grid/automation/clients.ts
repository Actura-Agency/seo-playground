import type { GridSchedule, GridSearchEntry } from '@/lib/db';

const CLIENT_PAGE = '/dashboard/geo-grid/automation/client';

/** Tidies a typed client name: trims it and collapses runs of spaces. */
export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Case- and space-insensitive, so "Arctic Pools " and "arctic pools" are the same client. */
export function clientKey(name: string): string {
  return normalizeClientName(name).toLowerCase();
}

export function clientUrl(name: string): string {
  return `${CLIENT_PAGE}?name=${encodeURIComponent(normalizeClientName(name))}`;
}

export interface ClientGroup {
  /** Display name: the spelling of the client's first schedule. */
  name: string;
  schedules: GridSchedule[];
  activeCount: number;
  /** Soonest upcoming run among active schedules. */
  nextRunAt: number | null;
  /** Most recent run of any schedule. */
  lastRunAt: number | null;
  /** Schedules whose latest run failed. */
  failedCount: number;
  /** Schedules with a run in progress. */
  runningCount: number;
}

/** One group per client, sorted by name. A schedule without a client falls under its business name. */
export function groupSchedulesByClient(schedules: GridSchedule[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const s of schedules) {
    const name = normalizeClientName(s.client || s.target);
    const key = clientKey(name);
    let g = groups.get(key);
    if (!g) {
      g = { name, schedules: [], activeCount: 0, nextRunAt: null, lastRunAt: null, failedCount: 0, runningCount: 0 };
      groups.set(key, g);
    }
    g.schedules.push(s);
    if (s.enabled) {
      g.activeCount++;
      if (s.next_run_at !== null && (g.nextRunAt === null || s.next_run_at < g.nextRunAt)) g.nextRunAt = s.next_run_at;
    }
    if (s.last_run_at !== null && (g.lastRunAt === null || s.last_run_at > g.lastRunAt)) g.lastRunAt = s.last_run_at;
    if (s.last_status === 'failed') g.failedCount++;
    if (s.last_status === 'starting' || s.last_status === 'running') g.runningCount++;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/** The schedules belonging to `name` (same matching as the grouping above). */
export function schedulesForClient(schedules: GridSchedule[], name: string): GridSchedule[] {
  const key = clientKey(name);
  return schedules.filter((s) => clientKey(s.client || s.target) === key);
}

const REPORT_PAGE = '/dashboard/geo-grid/report';

/** Print-ready report (Save as PDF) of these scans. */
export function scanReportUrl(scanIds: string[]): string {
  return `${REPORT_PAGE}?ids=${scanIds.map(encodeURIComponent).join(',')}`;
}

/** Print-ready report of every scan a client's schedules ran on one Pacific-time day ("YYYY-MM-DD"). */
export function clientDayReportUrl(client: string, day: string): string {
  return `${REPORT_PAGE}?client=${encodeURIComponent(normalizeClientName(client))}&day=${day}`;
}

export interface ArpTrend {
  /** Average rank where found in the latest finished run; null if the business wasn't found at any point. */
  arp: number | null;
  /** Previous finished run's ARP, when there is one to compare with. */
  previous: number | null;
  /** previous − latest, so positive means the rank number dropped, i.e. it got better. Null if either side is missing. */
  improvement: number | null;
  /** When the run the ARP comes from ran. */
  ts: number;
  /** True when a newer run timed out or is still going, so this ARP is from an older run. */
  olderRun: boolean;
}

/**
 * ARP of a schedule's latest finished run and how it moved since the run before. `runs` is newest
 * first (getGridSearchesBySchedule); still-running and timed-out (partial) runs are skipped.
 */
export function arpTrend(runs: Pick<GridSearchEntry, 'ts' | 'status' | 'summary'>[]): ArpTrend | null {
  const done = runs.filter((r) => r.status === 'done' && r.summary);
  if (done.length === 0) return null;
  const arp = done[0].summary!.avgRank;
  const previous = done.length > 1 ? done[1].summary!.avgRank : null;
  const improvement = arp !== null && previous !== null ? Math.round((previous - arp) * 10) / 10 : null;
  return { arp, previous, improvement, ts: done[0].ts, olderRun: runs[0] !== done[0] };
}
