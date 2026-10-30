import { randomUUID } from 'crypto';
import {
  getDueGridSchedules, claimGridScheduleRun, setGridScheduleRunResult, syncRunningGridSchedules,
  failInterruptedGridSchedules, getPendingGridSearches, markGridSearchTimedOut, setSetting, getSetting,
  gridScanReturnedNothing,
} from '@/lib/db';
import { startGridScan, collectGridResults } from './grid-scan';
import { computeNextRun } from './grid-schedule';

const TICK_MS = 60_000;
const FIRST_TICK_DELAY_MS = 15_000;
/** A queued scan still incomplete after this long is given up on (Standard normally takes 5–45 min). */
const PENDING_TIMEOUT_MS = 24 * 60 * 60_000;
const HEARTBEAT_KEY = 'grid_scheduler_heartbeat';

const g = globalThis as typeof globalThis & { __gridSchedulerStarted?: boolean; __gridSchedulerTicking?: boolean };

/** Only a server started with GRID_SCHEDULER=on runs schedules, so a local copy of the DB can never fire paid scans. */
export function isGridSchedulerEnabled(): boolean {
  return process.env.GRID_SCHEDULER === 'on';
}

/** Last time the scheduler completed a tick (ms), so the Automation page can warn if it isn't running. */
export function getGridSchedulerHeartbeat(): number | null {
  const v = getSetting(HEARTBEAT_KEY);
  return v ? Number(v) : null;
}

/** Called once at server start (src/instrumentation.ts). */
export function startGridScheduler(): void {
  if (!isGridSchedulerEnabled() || g.__gridSchedulerStarted) return;
  g.__gridSchedulerStarted = true;
  failInterruptedGridSchedules();
  console.log('[grid-scheduler] started');
  setTimeout(() => {
    void runGridSchedulerTick();
    setInterval(() => void runGridSchedulerTick(), TICK_MS);
  }, FIRST_TICK_DELAY_MS);
}

/**
 * One pass: start every due schedule, then advance every queued scan (automated or manual, so a
 * Standard scan also finishes when nobody keeps its page open), then settle finished runs.
 * Ticks never overlap; a slow pass just delays the next one.
 */
export async function runGridSchedulerTick(now = Date.now()): Promise<void> {
  if (g.__gridSchedulerTicking) return;
  g.__gridSchedulerTicking = true;
  try {
    for (const s of getDueGridSchedules(now)) {
      const next = computeNextRun(s, now);
      if (!claimGridScheduleRun(s.id, s.next_run_at!, next, now)) continue;
      const scanId = randomUUID().replace(/-/g, '').slice(0, 12);
      try {
        const result = await startGridScan(scanId, {
          keyword: s.keyword,
          center: s.center,
          gridSize: s.grid_size,
          spacingKm: s.spacing_km,
          target: s.target,
          language: s.language,
          queueMode: s.queue_mode,
          depth: s.queue_mode !== 'live' && s.depth === 10 ? 10 : 20,
        }, s.id);
        if (result.error) {
          setGridScheduleRunResult(s.id, 'failed', null, result.error);
        } else if (result.status === 'done' && gridScanReturnedNothing(scanId)) {
          setGridScheduleRunResult(s.id, 'failed', scanId, 'DataForSEO returned no results at any point (check the account balance)');
        } else {
          setGridScheduleRunResult(s.id, result.status === 'done' ? 'success' : 'running', scanId, null);
        }
        console.log(`[grid-scheduler] schedule ${s.id} → ${result.error ? `failed: ${result.error}` : `scan ${scanId} (${result.status})`}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setGridScheduleRunResult(s.id, 'failed', null, message);
        console.error(`[grid-scheduler] schedule ${s.id} threw`, e);
      }
    }

    for (const scan of getPendingGridSearches()) {
      try {
        const result = await collectGridResults(scan.id);
        if (result.status !== 'done' && now - scan.ts > PENDING_TIMEOUT_MS) {
          markGridSearchTimedOut(scan.id);
          console.warn(`[grid-scheduler] scan ${scan.id} timed out`);
        }
      } catch (e) {
        console.error(`[grid-scheduler] collecting scan ${scan.id} failed`, e);
      }
    }

    syncRunningGridSchedules();
    setSetting(HEARTBEAT_KEY, String(Date.now()));
  } catch (e) {
    console.error('[grid-scheduler] tick failed', e);
  } finally {
    g.__gridSchedulerTicking = false;
  }
}
