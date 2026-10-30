import {
  getCredentials, getGridEntry, getGridProgress, updateGridProgress, saveGridSearch, saveGridSearchPending,
  type GridPoint, type GridLocalItem, type GridTaskPoint, type GridSearchEntry, type GridQueueMode, type GridStatus,
} from '@/lib/db';
import { fetchGridSearch, postGridTasksQueue, mapWithConcurrency, type GridDepth } from './grid-api';

export interface GridScanSettings {
  keyword: string;
  center: string;
  gridSize: number;
  spacingKm: number;
  target: string;
  language: string;
  queueMode: GridQueueMode;
  depth: GridDepth;
}

/**
 * Starts one geo-grid scan and saves it to history under `id` — the single code path shared by the
 * manual form (geo-grid/page.tsx) and the automation scheduler. Live scans finish before this
 * returns ("done"); queued scans are saved as "pending" and completed by collectGridResults().
 */
export async function startGridScan(
  id: string, s: GridScanSettings, scheduleId?: number,
): Promise<{ error?: string; status?: GridStatus }> {
  const creds = getCredentials();
  if (!creds) return { error: 'DataForSEO credentials missing. Configure them in Settings.' };

  const baseEntry: GridSearchEntry = {
    id, ts: Date.now(),
    keyword: s.keyword,
    target: s.target,
    center: s.center,
    grid_size: s.gridSize,
    spacing_km: s.spacingKm,
    language: s.language,
    status: 'done',
    queue_mode: s.queueMode,
    depth: s.depth,
    schedule_id: scheduleId,
  };

  if (s.queueMode === 'live') {
    const result = await fetchGridSearch(
      s.keyword, s.center, s.gridSize, s.spacingKm, s.language, s.target, creds.login, creds.pass, s.depth,
    );
    if (result.error) return { error: result.error };
    saveGridSearch({ ...baseEntry, cost: result.cost }, result.results);
    return { status: 'done' };
  }

  const result = await postGridTasksQueue(
    s.keyword, s.center, s.gridSize, s.spacingKm, s.language, creds.login, creds.pass, s.queueMode, s.depth,
  );
  if (result.error) return { error: result.error };
  saveGridSearchPending({ ...baseEntry, status: 'pending', cost: result.cost }, result.taskPoints);
  return { status: 'pending' };
}

export interface DFSTaskGetResponse {
  status_code?: number;
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{
      items?: Array<{
        type: string;
        rank_group: number;
        title?: string;
        domain?: string;
        url?: string;
        place_id?: string;
        cid?: string;
        is_paid?: boolean;
        rating?: { value?: number; votes_count?: number };
      }>;
    }>;
  }>;
}

/**
 * Keeps only organic (non-sponsored) local-pack results, then renumbers rank_group sequentially
 * so a removed ad slot doesn't leave a gap (e.g. an ad at #1 shouldn't push the real top organic
 * result to read as #2). A business that also appears organically elsewhere in the same list
 * keeps that organic entry — only the paid entry itself is ever dropped.
 */
function excludeSponsored<T extends { type: string; is_paid?: boolean; rank_group: number }>(items: T[]): T[] {
  return items
    .filter((i) => i.type === 'local_pack' && !i.is_paid)
    .sort((a, b) => a.rank_group - b.rank_group)
    .map((item, idx) => ({ ...item, rank_group: idx + 1 }));
}

// DataForSEO task status codes that mean "not finished yet": 40601/40602 = still queued/processing.
const STILL_PROCESSING = new Set([40601, 40602]);
// Codes that mean the *check itself* was refused or failed (too many simultaneous requests, rate
// limit, DataForSEO internal error), not that the task failed. Retried on the next check, never
// turned into an empty "Not found" point.
const RETRY_LATER = new Set([40202, 40209, 50000, 50301]);
/** DataForSEO allows 30 simultaneous requests per account; stay well under it, leaving room for other tabs and tools. */
const CHECK_CONCURRENCY = 8;

/**
 * Reads one task_get response: 'ready' (finished, successfully or permanently failed), or
 * 'pending' (still in the queue, or the check should simply be retried).
 */
export function classifyTaskGet(data: DFSTaskGetResponse | null): 'ready' | 'pending' {
  // A refused or failed request (top-level code other than 20000) says nothing about the task itself.
  if (!data || (data.status_code !== undefined && data.status_code !== 20000)) return 'pending';
  const code = data.tasks?.[0]?.status_code;
  if (code === undefined || STILL_PROCESSING.has(code) || RETRY_LATER.has(code)) return 'pending';
  return 'ready';
}

export type CollectResult =
  | { status: 'done' | 'pending'; ready: number; total: number; cost?: number }
  | { status: 'error'; error: string; httpStatus: number };

// The browser's polling route and the background scheduler both call collectGridResults(). Two
// overlapping runs on the same scan would each append the same newly-ready points, so only one
// may run per scan at a time. Kept on globalThis because the route handler and the scheduler can
// be loaded as separate module copies within the one server process.
const g = globalThis as typeof globalThis & { __gridCollecting?: Set<string> };
const collecting = (g.__gridCollecting ??= new Set<string>());

/** Checks a queued scan's outstanding DataForSEO tasks once and saves any points that are ready. */
export async function collectGridResults(id: string): Promise<CollectResult> {
  const entry = getGridEntry(id);
  if (!entry) return { status: 'error', error: 'Not found', httpStatus: 404 };
  const total = entry.grid_size ** 2;
  // 'error' = timed out (see markGridSearchTimedOut): finished, with whatever points arrived.
  if (entry.status === 'done' || entry.status === 'error') {
    return { status: 'done', ready: total, total };
  }

  const progress = getGridProgress(id);
  if (!progress || progress.pendingTasks.length === 0) {
    return { status: 'error', error: 'No pending task IDs stored', httpStatus: 400 };
  }

  if (collecting.has(id)) {
    return { status: 'pending', ready: progress.results.length, total };
  }

  const creds = getCredentials();
  if (!creds) return { status: 'error', error: 'No credentials', httpStatus: 401 };

  collecting.add(id);
  try {
    const auth = btoa(`${creds.login}:${creds.pass}`);
    const targetLower = entry.target.toLowerCase();

    // Only re-check tasks that aren't already collected — once a task's been read here it's never
    // queried again. Checks run a few at a time: firing all 121 at once went over DataForSEO's
    // simultaneous-request limit, and the refused checks (always the last-posted points, at the end
    // of the list) made the final ~20 points of an 11x11 look slow.
    const checks = await mapWithConcurrency(
      progress.pendingTasks, CHECK_CONCURRENCY,
      async (tp: GridTaskPoint) => {
        try {
          const res = await fetch(
            `https://api.dataforseo.com/v3/serp/google/local_finder/task_get/advanced/${tp.task_id}`,
            { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) },
          );
          if (!res.ok) return { tp, ready: false, items: [] };
          const data = await res.json() as DFSTaskGetResponse;
          if (classifyTaskGet(data) === 'pending') return { tp, ready: false, items: [] };
          // Success, or a permanent task failure → mark as done (empty items for failures). Sponsored/paid
          // local-pack entries are excluded from ranking entirely — see excludeSponsored().
          const task = data.tasks![0];
          const rawItems = task.status_code === 20000
            ? excludeSponsored(task.result?.[0]?.items ?? [])
            : [];
          return { tp, ready: true, items: rawItems };
        } catch {
          // Network timeout or fetch error → not ready, will retry next poll
          return { tp, ready: false, items: [] };
        }
      },
    );
    const arrivedAt = Date.now();

    const isTarget = (title: string, domain: string, url: string) =>
      title.toLowerCase().includes(targetLower) ||
      domain.toLowerCase().includes(targetLower) ||
      url.toLowerCase().includes(targetLower);

    const newlyReady: GridPoint[] = [];
    const stillPending: GridTaskPoint[] = [];

    for (const check of checks) {
      if (!check.ready) {
        stillPending.push(check.tp);
        continue;
      }
      const match = check.items.find((item) =>
        isTarget(item.title ?? '', item.domain ?? '', item.url ?? ''),
      );
      const gridItems: GridLocalItem[] = check.items.slice(0, 20).map((item) => ({
        rank_group: item.rank_group,
        title: item.title ?? '—',
        domain: item.domain,
        url: item.url,
        place_id: item.place_id,
        cid: item.cid,
        rating_value: item.rating?.value,
        rating_votes: item.rating?.votes_count,
        is_target: isTarget(item.title ?? '', item.domain ?? '', item.url ?? ''),
      }));
      newlyReady.push({
        row: check.tp.row, col: check.tp.col, lat: check.tp.lat, lng: check.tp.lng,
        rank: match ? match.rank_group : null, items: gridItems, arrived_at: arrivedAt,
      });
    }

    const accumulatedResults = [...progress.results, ...newlyReady];
    updateGridProgress(id, accumulatedResults, stillPending);

    const ready = accumulatedResults.length;
    if (stillPending.length > 0) {
      return { status: 'pending', ready, total };
    }
    return { status: 'done', ready, total, cost: entry.cost };
  } finally {
    collecting.delete(id);
  }
}
