export const dynamic = 'force-dynamic';

import {
  getGridSchedules, getGridScansByIds, getScheduleScansBetween, type GridSchedule, type GridScanWithResults,
} from '@/lib/db';
import { formatDayKey, formatScheduleDate, zonedDayRange } from '../../local-finder/grid-schedule';
import { clientUrl, groupSchedulesByClient, normalizeClientName, schedulesForClient } from '../automation/clients';
import GridReport from '../../local-finder/GridReport';
import PrintButton from './PrintButton';
import LightForPrint from './LightForPrint';

interface SearchParams {
  /** Comma-separated scan ids: one or more specific scans. */
  ids?: string;
  /** Or every scan a client's schedules ran on one Pacific-time day ("YYYY-MM-DD"). */
  client?: string;
  day?: string;
}

/** Most scans one report will print; keeps a stray link from building a huge page. */
const MAX_SCANS = 50;

/**
 * Print-ready geo-grid report, one page per scan. On screen it shows a toolbar; printing hides the
 * app's menu and header so "Save as PDF" produces just the report pages.
 */
export default async function GridReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const allSchedules = getGridSchedules();
  const scheduleById = new Map<number, GridSchedule>(allSchedules.map((s) => [s.id, s]));

  let scans: GridScanWithResults[] = [];
  let title = 'Geo-grid report';
  let subtitle = '';
  let backHref = '/dashboard/geo-grid';

  if (params.ids) {
    scans = getGridScansByIds([...new Set(params.ids.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SCANS));
    if (scans.length === 1) {
      title = scans[0].target;
      subtitle = formatScheduleDate(scans[0].ts) + ' PT';
    }
  } else if (params.client && params.day) {
    const schedules = schedulesForClient(allSchedules, params.client);
    const range = zonedDayRange(params.day);
    title = groupSchedulesByClient(schedules)[0]?.name ?? normalizeClientName(params.client);
    backHref = clientUrl(title);
    if (range) {
      subtitle = formatDayKey(params.day);
      scans = getScheduleScansBetween(schedules.map((s) => s.id), range[0], range[1]).slice(0, MAX_SCANS);
    }
  }

  return (
    <div className="max-w-[780px] print:max-w-none mx-auto">
      <LightForPrint />
      {/* Screen-only toolbar */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <a href={backHref} className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors">
            ← Back
          </a>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight break-words">{title}</h1>
          <p className="text-sm text-slate-400">
            {subtitle && <>{subtitle} · </>}
            {scans.length} {scans.length === 1 ? 'scan' : 'scans'}{scans.length > 1 && ', one page each'}
          </p>
        </div>
        {scans.length > 0 && <PrintButton />}
      </div>
      {scans.length > 0 && (
        <p className="print:hidden text-[11px] text-slate-400 -mt-4 mb-6">
          Wait for every map to finish loading, then click Save as PDF and choose &ldquo;Save as PDF&rdquo; as the destination.
        </p>
      )}

      {scans.length === 0 ? (
        <p className="text-sm text-slate-500">No finished scans found for this report.</p>
      ) : (
        <div className="grid-report space-y-6 print:space-y-0">
          {scans.map((scan, i) => {
            const schedule = scan.schedule_id !== undefined ? scheduleById.get(scan.schedule_id) : undefined;
            return (
              <section
                key={scan.id}
                className={`bg-white rounded-2xl border border-slate-200 p-6 print:border-0 print:rounded-none print:p-0 break-inside-avoid ${i > 0 ? 'print:break-before-page' : ''}`}
              >
                <GridReport
                  results={scan.results}
                  gridSize={scan.grid_size}
                  spacingKm={scan.spacing_km}
                  keyword={scan.keyword}
                  target={scan.target}
                  client={schedule ? schedule.client || schedule.target : undefined}
                  scannedAt={`${formatScheduleDate(scan.ts)} PT`}
                  depth={scan.depth}
                  partial={scan.status === 'error'}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
