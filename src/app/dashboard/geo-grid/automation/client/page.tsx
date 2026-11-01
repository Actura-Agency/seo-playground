export const dynamic = 'force-dynamic';

import { getGridSchedules, getScheduleScanTimes } from '@/lib/db';
import { AUTOMATION_TZ_LABEL, formatDayKey, zonedDayKey } from '../../../local-finder/grid-schedule';
import { groupSchedulesByClient, schedulesForClient } from '../clients';
import SchedulesTable from '../SchedulesTable';

const AUTOMATION_PATH = '/dashboard/geo-grid/automation';

/** One client's schedules, plus a PDF export of every scan they ran on a chosen day. */
export default async function GridClientPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name = '' } = await searchParams;
  const schedules = schedulesForClient(getGridSchedules(), name);
  const group = groupSchedulesByClient(schedules)[0];

  const backLink = (
    <a href={AUTOMATION_PATH} className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors">
      ← All clients
    </a>
  );

  if (!group) {
    return (
      <div className="space-y-4 max-w-5xl">
        {backLink}
        <p className="text-sm text-slate-500">No schedules for &ldquo;{name}&rdquo;. They may have been moved to another client or deleted.</p>
      </div>
    );
  }

  // Days (Pacific) on which this client's schedules produced a finished scan, newest first, with counts.
  const dayCounts = new Map<string, number>();
  for (const ts of getScheduleScanTimes(schedules.map((s) => s.id))) {
    const day = zonedDayKey(ts);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const days = [...dayCounts.entries()];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-2">
        {backLink}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight break-words">{group.name}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}. Times are {AUTOMATION_TZ_LABEL}.
            </p>
          </div>
          <a
            href={`${AUTOMATION_PATH}?new=1&client=${encodeURIComponent(group.name)}`}
            className="px-4 py-2 bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-colors"
          >
            + Add a schedule
          </a>
        </div>
      </div>

      <form
        method="GET"
        action="/dashboard/geo-grid/report"
        target="_blank"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm"
      >
        <input type="hidden" name="client" value={group.name} />
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Export a day&apos;s scans as PDF</label>
        {days.length > 0 ? (
          <>
            <div className="flex gap-2">
              <select
                name="day"
                defaultValue={days[0][0]}
                className="flex-1 min-w-0 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                {days.map(([day, count]) => (
                  <option key={day} value={day}>
                    {formatDayKey(day)} · {count} {count === 1 ? 'scan' : 'scans'}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-colors whitespace-nowrap"
              >
                Export PDF
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Opens a print-ready report with one page per scan. In the print window, choose &ldquo;Save as PDF&rdquo;. To export a single scan, use the PDF link next to it under Past runs.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">No finished scans yet. Exports show up here after the first scheduled run.</p>
        )}
      </form>

      <SchedulesTable schedules={schedules} />
    </div>
  );
}
