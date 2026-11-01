import { getGridSearchesBySchedule, type GridSchedule } from '@/lib/db';
import { describeSchedule, formatScheduleDate } from '../../local-finder/grid-schedule';
import DeleteScheduleButton from './DeleteScheduleButton';
import PendingButton from '@/components/PendingButton';
import { toggleScheduleAction } from './actions';
import { scanReportUrl } from './clients';

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

// Below `sm` the table stacks: each row becomes a small card, each cell a line. Desktop is unchanged.
const CELL = 'max-sm:block max-sm:px-0 max-sm:py-0.5 max-sm:min-w-0 max-sm:text-left';
const MOBILE_LABEL = 'sm:hidden text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1.5';

/** One client's schedules: timing, last/next run, pause toggle, edit and delete, and past runs with PDF links. */
export default function SchedulesTable({ schedules, title = 'Schedules' }: { schedules: GridSchedule[]; title?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h2>
        <span className="text-[11px] tabular-nums text-slate-400">{schedules.length}</span>
      </div>
      {schedules.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">No schedules yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm max-sm:block">
            <thead className="max-sm:hidden">
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-5 py-2.5">Name · keyword</th>
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
                    <td className={`px-5 py-3 min-w-[220px] ${CELL}`}>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{s.label}</p>
                      <p className="text-[13px] text-slate-600 dark:text-slate-300">&ldquo;{s.keyword}&rdquo;</p>
                      <p className="text-[11px] text-slate-400">
                        {s.grid_size}×{s.grid_size} · Top {s.depth}
                      </p>
                      {runs.length > 0 && (
                        <details className="mt-1.5">
                          <summary className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 cursor-pointer">
                            Past runs ({runs.length}{runs.length === 10 ? '+' : ''})
                          </summary>
                          <ul className="mt-1.5 space-y-1">
                            {runs.map((r) => (
                              <li key={r.id} className="flex items-baseline gap-2">
                                <a href={`/dashboard/geo-grid?grid_history_id=${r.id}#results`} className="text-[11px] text-slate-500 hover:text-blue-600">
                                  {formatScheduleDate(r.ts)}
                                  {r.status === 'pending' ? ' · pending'
                                    : r.status === 'error' ? ' · timed out (partial)'
                                      : r.summary ? ` · ${r.summary.ato}% · ${r.summary.foundCount}/${r.summary.totalPoints} found` : ''}
                                </a>
                                {r.status !== 'pending' && (
                                  <a
                                    href={scanReportUrl([r.id])}
                                    target="_blank"
                                    rel="noopener"
                                    className="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700"
                                    title="Open a print-ready report of this scan (Save as PDF)"
                                  >
                                    PDF
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className={`px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 ${CELL}`}><span className={MOBILE_LABEL}>Runs</span>{describeSchedule(s)}</td>
                    <td className={`px-3 py-3 whitespace-nowrap ${CELL}`}>
                      <span className={MOBILE_LABEL}>Last scan</span>
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
                    <td className={`px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 ${CELL}`}>
                      <span className={MOBILE_LABEL}>Next scan</span>
                      {s.enabled && s.next_run_at ? formatScheduleDate(s.next_run_at) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className={`px-3 py-3 ${CELL} max-sm:pt-2`}>
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
                    <td className={`px-5 py-3 ${CELL} max-sm:pt-2`}>
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
  );
}
