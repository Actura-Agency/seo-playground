export const dynamic = 'force-dynamic';

import {
  getGridSchedules, getGridSchedule, getGridEntry, getRecentManualGridScans, getSetting,
} from '@/lib/db';
import { formatScheduleDate, AUTOMATION_TZ_LABEL } from '../../local-finder/grid-schedule';
import { isGridSchedulerEnabled, getGridSchedulerHeartbeat } from '../../local-finder/grid-scheduler';
import { KM_PER_MILE } from '../../local-finder/grid-form-options';
import ScheduleForm, { type ScheduleFormValues } from './ScheduleForm';
import { clientUrl, groupSchedulesByClient } from './clients';

interface SearchParams {
  from?: string;
  edit?: string;
  /** "1" opens a blank new-client form; the Geo-Grid form's "Schedule instead" button also sends its fields below. */
  new?: string;
  /** Pre-fills the new-schedule form's Client (the client page's "Add a schedule" link). */
  client?: string;
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

export default async function GridAutomationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const schedules = getGridSchedules();
  const clients = groupSchedulesByClient(schedules);

  // The form opens to edit a schedule, pre-filled from a saved scan, pre-filled from the Geo-Grid
  // form ("Schedule instead of running now"), or blank for a brand-new client.
  const editing = params.edit ? getGridSchedule(parseInt(params.edit, 10)) : null;
  const fromScan = !editing && params.from ? getGridEntry(params.from) : null;
  const isNew = !editing && !fromScan && params.new === '1';
  const newTiming = { label: '', frequency: 'weekly' as const, dayOfWeek: 1, dayOfMonth: 1, timeOfDay: '08:00' };

  let form: { scheduleId?: number; initial: ScheduleFormValues; title: string; note?: string; cancelHref?: string } | null = null;
  if (editing) {
    form = {
      scheduleId: editing.id,
      cancelHref: clientUrl(editing.client || editing.target),
      title: 'Edit schedule',
      note: 'Changes apply from the next scheduled run. Past runs stay in history.',
      initial: {
        keyword: editing.keyword, target: editing.target, center: editing.center,
        gridSize: editing.grid_size, spacingKm: editing.spacing_km, client: editing.client || editing.target, label: editing.label,
        frequency: editing.frequency, dayOfWeek: editing.day_of_week ?? 1, dayOfMonth: editing.day_of_month ?? 1,
        timeOfDay: editing.time_of_day, depth: editing.depth === 10 ? 10 : 20,
      },
    };
  } else if (fromScan) {
    form = {
      title: 'New schedule',
      note: `Pre-filled from the ${formatScheduleDate(fromScan.ts)} scan. Change anything you need.`,
      initial: {
        ...newTiming,
        keyword: fromScan.keyword, target: fromScan.target, center: fromScan.center,
        gridSize: fromScan.grid_size, spacingKm: fromScan.spacing_km, client: fromScan.target, label: fromScan.target,
        depth: 10,
      },
    };
  } else if (isNew) {
    const gridSize = parseInt(params.grid_size ?? '', 10);
    const spacingKm = parseFloat(params.spacing_km ?? '');
    form = {
      cancelHref: params.client ? clientUrl(params.client) : undefined,
      title: 'New client schedule',
      note: 'Nothing is scanned (or billed) until the first scheduled time.',
      initial: {
        ...newTiming,
        keyword: params.keyword ?? '', target: params.grid_target ?? '', center: params.location_coordinate ?? '',
        gridSize: [3, 5, 7, 9, 11, 13].includes(gridSize) ? gridSize : 11,
        spacingKm: spacingKm > 0 ? spacingKm : KM_PER_MILE,
        client: params.client ?? params.grid_target ?? '',
        label: params.grid_target ?? '',
        depth: params.depth === '20' ? 20 : 10,
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

      {form && (
        <ScheduleForm
          {...form}
          cancelHref={form.cancelHref ?? '/dashboard/geo-grid/automation'}
          clients={clients.map((c) => c.name)}
          defaultCenter={getSetting('default_coordinates') ?? ''}
        />
      )}

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
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Clients</h2>
          <span className="text-[11px] tabular-nums text-slate-400">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'} · {schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}
          </span>
        </div>
        {clients.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No schedules yet.</p>
        ) : (
          <ul className="divide-y divide-slate-50 dark:divide-slate-800">
            {clients.map((c) => (
              <li key={c.name}>
                <a
                  href={clientUrl(c.name)}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-x-6 gap-y-1 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {c.schedules.length} {c.schedules.length === 1 ? 'schedule' : 'schedules'}
                      {c.activeCount < c.schedules.length && ` · ${c.schedules.length - c.activeCount} paused`}
                    </p>
                  </div>
                  <div className="text-[12px] text-slate-600 dark:text-slate-300 sm:w-44 shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1.5">Last</span>
                    {c.lastRunAt ? formatScheduleDate(c.lastRunAt) : '—'}
                  </div>
                  <div className="text-[12px] text-slate-600 dark:text-slate-300 sm:w-44 shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1.5">Next</span>
                    {c.nextRunAt ? formatScheduleDate(c.nextRunAt) : '—'}
                  </div>
                  <div className="flex items-center gap-1.5 sm:w-28 shrink-0 sm:justify-end">
                    {c.failedCount > 0 && (
                      <span className="text-[10px] font-black border px-1.5 py-0.5 rounded text-red-600 bg-red-50 border-red-200">
                        {c.failedCount} failed
                      </span>
                    )}
                    {c.runningCount > 0 && (
                      <span className="text-[10px] font-black border px-1.5 py-0.5 rounded text-amber-600 bg-amber-50 border-amber-200">
                        Running
                      </span>
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Open →</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
