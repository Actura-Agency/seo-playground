export const dynamic = 'force-dynamic';

import {
  getGridSchedules, getGridSchedule, getGridEntry, getRecentManualGridScans, getGridSearchesBySchedule,
  getSetting, type GridSchedule,
} from '@/lib/db';
import {
  describeSchedule, formatScheduleDate, AUTOMATION_TZ_LABEL,
} from '../../local-finder/grid-schedule';
import { isGridSchedulerEnabled, getGridSchedulerHeartbeat } from '../../local-finder/grid-scheduler';
import { KM_PER_MILE } from '../../local-finder/grid-form-options';
import ScheduleForm, { type ScheduleFormValues } from './ScheduleForm';
import DeleteScheduleButton from './DeleteScheduleButton';
import PendingButton from '@/components/PendingButton';
import { toggleScheduleAction } from './actions';

interface SearchParams {
  from?: string;
  edit?: string;
  /** "1" opens a blank new-client form; the Geo-Grid form's "Schedule instead" button also sends its fields below. */
  new?: string;
  error?: string;
  keyword?: string;
  grid_target?: string;
  location_coordinate?: string;
  grid_size?: string;
  spacing_km?: string;
  language?: string;
  queue_mode?: string;
  depth?: string;
}

/** The scheduler ticks every minute; a heartbeat older than this means it isn't running. */
const HEARTBEAT_STALE_MS = 5 * 60_000;

function StatusBadge({ s }: { s: GridSchedule }) {
  const map: Record<string, { text: string; cls: string }> = {
    starting: { text: 'Starting', cls: 'text-amber-600 bg-amber-50 border-amber-200' },
    running: { text: 'Running', cls: 'text-amber-600 bg-amber-50 border-amber-200' },
    success: { text: 'Success', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    failed: { text: 'Failed', cls: 'text-red-600 bg-red-50 border-red-200' },
  };
  const badge = s.last_status ? map[s.last_status] : null;
  if (!badge) return <span className="text-[11px] text-slate-400">Not run yet</span>;
  return (
    <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded ${badge.cls}`} title={s.last_error ?? undefined}>
      {badge.text}
    </span>
  );
}

export default async function GridAutomationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const schedules = getGridSchedules();

  // The form opens to edit a schedule, pre-filled from a saved scan, pre-filled from the Geo-Grid
  // form ("Schedule instead of running now"), or blank for a brand-new client.
  const editing = params.edit ? getGridSchedule(parseInt(params.edit, 10)) : null;
  const fromScan = !editing && params.from ? getGridEntry(params.from) : null;
  const isNew = !editing && !fromScan && params.new === '1';
  const newTiming = { label: '', frequency: 'weekly' as const, dayOfWeek: 1, dayOfMonth: 1, timeOfDay: '08:00' };

  let form: { scheduleId?: number; initial: ScheduleFormValues; title: string; note?: string } | null = null;
  if (editing) {
    form = {
      scheduleId: editing.id,
      title: 'Edit schedule',
      note: 'Changes apply from the next scheduled run. Past runs stay in history.',
      initial: {
        keyword: editing.keyword, target: editing.target, center: editing.center,
        gridSize: editing.grid_size, spacingKm: editing.spacing_km, label: editing.label,
        frequency: editing.frequency, dayOfWeek: editing.day_of_week ?? 1, dayOfMonth: editing.day_of_month ?? 1,
        timeOfDay: editing.time_of_day, queueMode: editing.queue_mode, depth: editing.depth === 10 ? 10 : 20,
      },
    };
  } else if (fromScan) {
    form = {
      title: 'New schedule',
      note: `Pre-filled from the ${formatScheduleDate(fromScan.ts)} scan. Change anything you need.`,
      initial: {
        ...newTiming,
        keyword: fromScan.keyword, target: fromScan.target, center: fromScan.center,
        gridSize: fromScan.grid_size, spacingKm: fromScan.spacing_km, label: fromScan.target,
        // Cheapest by default; the form still offers every mode.
        queueMode: 'standard', depth: 10,
      },
    };
  } else if (isNew) {
    const mode = params.queue_mode === 'live' || params.queue_mode === 'priority' ? params.queue_mode : 'standard';
    const gridSize = parseInt(params.grid_size ?? '', 10);
    const spacingKm = parseFloat(params.spacing_km ?? '');
    form = {
      title: 'New client schedule',
      note: 'Nothing is scanned (or billed) until the first scheduled time.',
      initial: {
        ...newTiming,
        keyword: params.keyword ?? '', target: params.grid_target ?? '', center: params.location_coordinate ?? '',
        gridSize: [3, 5, 7, 9, 11, 13].includes(gridSize) ? gridSize : 11,
        spacingKm: spacingKm > 0 ? spacingKm : KM_PER_MILE,
        label: params.grid_target ?? '',
        queueMode: mode, depth: mode !== 'live' && params.depth === '20' ? 20 : 10,
      },
    };
  }

  const schedulerOn = isGridSchedulerEnabled();
  const heartbeat = getGridSchedulerHeartbeat();
  const heartbeatStale = schedulerOn && heartbeat !== null && Date.now() - heartbeat > HEARTBEAT_STALE_MS;

  const recentScans = getRecentManualGridScans();

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Grid Automation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Run saved geo-grid scans automatically. Every run is saved to Grid Search History like a manual scan. Times are {AUTOMATION_TZ_LABEL}.
        </p>
      </div>

      {!schedulerOn && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">
          Automation is off on this server, so schedules below will not run. To turn it on, set the environment variable <code className="font-mono font-bold">GRID_SCHEDULER=on</code> and redeploy.
        </div>
      )}
      {heartbeatStale && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          The scheduler hasn&apos;t checked in since {formatScheduleDate(heartbeat!)}. Scheduled scans may not be running. Try restarting the app.
        </div>
      )}

      {params.error === 'invalid' && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          The schedule wasn&apos;t saved: the keyword, target business and map center are required, and the center must be a valid lat,lng.
        </div>
      )}

      {form && <ScheduleForm {...form} defaultCenter={getSetting('default_coordinates') ?? ''} />}

      {!form && (
        <form method="GET" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400">New schedule from a saved scan</label>
            <a
              href="/dashboard/geo-grid/automation?new=1"
              className="text-[11px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 transition-colors"
              title="Schedule a client you haven't scanned yet"
            >
              Set up a new client →
            </a>
          </div>
          {recentScans.length > 0 ? (
            <div className="flex gap-2">
              <select
                name="from"
                required
                className="flex-1 min-w-0 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                {recentScans.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.target} · {e.keyword} · {e.grid_size}×{e.grid_size} · {formatScheduleDate(e.ts)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-colors"
              >
                Next
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No saved scans yet. Use &quot;Set up a new client&quot; to schedule one from scratch.</p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Schedules</h2>
          <span className="text-[11px] tabular-nums text-slate-400">{schedules.length}</span>
        </div>
        {schedules.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No schedules yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm max-sm:block">
              <thead className="max-sm:hidden">
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-2.5">Client · keyword</th>
                  <th className="px-3 py-2.5">Frequency</th>
                  <th className="px-3 py-2.5">Last scan</th>
                  <th className="px-3 py-2.5">Next scan</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800 max-sm:block">
                {schedules.map((s) => {
                  const runs = getGridSearchesBySchedule(s.id, 10);
                  return (
                    <tr key={s.id} className="align-top max-sm:block max-sm:px-5 max-sm:py-3">
                      <td className="px-5 py-3 min-w-[220px] max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:min-w-0 max-sm:text-left">
                        <p className="font-bold text-slate-800 dark:text-slate-200">{s.label}</p>
                        <p className="text-[13px] text-slate-600 dark:text-slate-300">&ldquo;{s.keyword}&rdquo;</p>
                        <p className="text-[11px] text-slate-400">
                          {s.grid_size}×{s.grid_size} · {s.queue_mode === 'standard' ? 'Standard' : s.queue_mode === 'priority' ? 'Priority' : 'Live'}, Top {s.depth}
                        </p>
                        {runs.length > 0 && (
                          <details className="mt-1.5">
                            <summary className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 cursor-pointer">
                              Past runs ({runs.length}{runs.length === 10 ? '+' : ''})
                            </summary>
                            <ul className="mt-1.5 space-y-1">
                              {runs.map((r) => (
                                <li key={r.id}>
                                  <a href={`/dashboard/geo-grid?grid_history_id=${r.id}#results`} className="text-[11px] text-slate-500 hover:text-blue-600">
                                    {formatScheduleDate(r.ts)}
                                    {r.status === 'pending' ? ' · pending'
                                      : r.status === 'error' ? ' · timed out (partial)'
                                        : r.summary ? ` · ${r.summary.ato}% · ${r.summary.foundCount}/${r.summary.totalPoints} found` : ''}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:min-w-0 max-sm:text-left"><span className="sm:hidden text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1.5">Runs</span>{describeSchedule(s)}</td>
                      <td className="px-3 py-3 whitespace-nowrap max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:min-w-0 max-sm:text-left">
                        <span className="sm:hidden text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1.5">Last scan</span>
                        {s.last_run_at ? (
                          <div className="space-y-1 max-sm:inline-block max-sm:align-top">
                            {s.last_scan_id ? (
                              <a href={`/dashboard/geo-grid?grid_history_id=${s.last_scan_id}#results`} className="block text-slate-600 dark:text-slate-300 hover:text-blue-600">
                                {formatScheduleDate(s.last_run_at)}
                              </a>
                            ) : (
                              <p className="text-slate-600 dark:text-slate-300">{formatScheduleDate(s.last_run_at)}</p>
                            )}
                            <StatusBadge s={s} />
                            {s.last_status === 'failed' && s.last_error && (
                              <p className="text-[11px] text-red-500 whitespace-normal max-w-[220px]">{s.last_error}</p>
                            )}
                          </div>
                        ) : (
                          <StatusBadge s={s} />
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:min-w-0 max-sm:text-left">
                        <span className="sm:hidden text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1.5">Next scan</span>
                        {s.enabled && s.next_run_at ? formatScheduleDate(s.next_run_at) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3 max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:min-w-0 max-sm:text-left max-sm:pt-2">
                        <form action={toggleScheduleAction}>
                          <input type="hidden" name="schedule_id" value={s.id} />
                          <PendingButton
                            type="submit"
                            title={s.enabled ? 'Click to pause' : 'Click to resume'}
                            className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border transition-colors ${
                              s.enabled
                                ? 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                : 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {s.enabled ? 'Active' : 'Paused'}
                          </PendingButton>
                        </form>
                      </td>
                      <td className="px-5 py-3 max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:min-w-0 max-sm:text-left max-sm:pt-2">
                        <div className="flex items-center justify-end max-sm:justify-start gap-3">
                          <a
                            href={`/dashboard/geo-grid/automation?edit=${s.id}`}
                            className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            Edit
                          </a>
                          <DeleteScheduleButton scheduleId={s.id} name={s.label} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
