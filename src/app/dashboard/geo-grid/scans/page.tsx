export const dynamic = 'force-dynamic';

import { getAllGridScans, getGridSchedules } from '@/lib/db';
import { gridRerunUrl } from '../../local-finder/grid-links';
import ScansTable, { type ScanRow } from './ScansTable';

export default async function AllGridScansPage() {
  const scheduleNames = new Map(getGridSchedules().map((s) => [s.id, s.label]));
  const rows: ScanRow[] = getAllGridScans().map((e) => ({
    id: e.id,
    ts: e.ts,
    keyword: e.keyword,
    target: e.target,
    center: e.center,
    gridSize: e.grid_size,
    spacingMi: e.spacing_km / 1.609344,
    cost: e.cost ?? null,
    pending: e.status === 'pending',
    timedOut: e.status === 'error',
    auto: e.schedule_id !== undefined,
    scheduleName: e.schedule_id !== undefined ? scheduleNames.get(e.schedule_id) ?? null : null,
    visibility: e.summary?.ato ?? null,
    found: e.summary?.foundCount ?? null,
    points: e.summary?.totalPoints ?? null,
    avgRank: e.summary?.avgRank ?? null,
    rerunUrl: gridRerunUrl(e),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">All Grid Scans</h1>
        <p className="text-sm text-slate-400 mt-1">Every saved geo-grid scan. Search, filter or sort to find a client, then open its heatmap.</p>
      </div>
      <ScansTable rows={rows} />
    </div>
  );
}
