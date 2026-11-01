'use client';

import { lazy, Suspense, useMemo } from 'react';
import type { GridPoint } from '@/lib/db';
import { computeCompetitors, computeGridSummary, computeRingStats } from './grid-insights';

const GridMap = lazy(() => import('./GridMap'));

interface Props {
  results: GridPoint[];
  gridSize: number;
  spacingKm: number;
  keyword: string;
  target: string;
  /** Client name (automation), shown above the keyword. */
  client?: string;
  /** Scan date, already formatted for display. */
  scannedAt: string;
  depth: number;
  /** True when the scan timed out and only some points came back. */
  partial?: boolean;
}

const LEGEND = [
  { color: '#1A6600', label: '#1' },
  { color: '#59810A', label: '#2-3' },
  { color: '#FFC826', label: '#4-5' },
  { color: '#DD7015', label: '#6-10' },
  { color: '#BA1604', label: '#11-20' },
  { color: '#94a3b8', label: 'Not found' },
];

/**
 * One scan laid out to fit a single printed page (US Letter): header, map with the headline
 * numbers beside it, top competitors and visibility by distance. Read-only; no clicks or lookups.
 */
export default function GridReport({ results, gridSize, spacingKm, keyword, target, client, scannedAt, depth, partial }: Props) {
  const { foundCount, top3Count, coverage, arp, solv } = computeGridSummary(results);
  const competitors = useMemo(() => computeCompetitors(results).slice(0, 5), [results]);
  const rings = useMemo(() => computeRingStats(results, gridSize, spacingKm), [results, gridSize, spacingKm]);
  const total = results.length;
  const spacingMi = spacingKm / 1.609344;

  return (
    <div className="space-y-4 text-slate-900">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {client ?? 'Geo-grid ranking report'}
          </p>
          <h2 className="text-xl font-black tracking-tight break-words">&ldquo;{keyword}&rdquo;</h2>
          <p className="text-[12px] text-slate-500">Target: <span className="font-bold text-slate-700">{target}</span></p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[12px] font-bold text-slate-700">{scannedAt}</p>
          <p className="text-[11px] text-slate-500">
            {gridSize}×{gridSize} grid · {spacingMi.toFixed(spacingMi < 1 ? 2 : 1)} mi apart · Top {depth}
          </p>
        </div>
      </div>

      {partial && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          This scan timed out before every point came back; numbers cover the points that did.
        </p>
      )}

      {/* Map + headline numbers */}
      <div className="flex flex-col sm:flex-row print:flex-row gap-4">
        <div className="w-full sm:w-[430px] print:w-[430px] shrink-0">
          <Suspense fallback={<div className="h-[430px] rounded-xl bg-slate-100" />}>
            <GridMap points={results} gridSize={gridSize} target={target} printView />
          </Suspense>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Coverage</p>
            <p className="text-2xl font-black tabular-nums">{Math.round(coverage)}%</p>
            <p className="text-[10px] text-slate-500">Found on {foundCount} of {total} points</p>
          </div>
          <div className="border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Average rank</p>
            <p className="text-2xl font-black tabular-nums">{arp !== null ? arp.toFixed(2) : '—'}</p>
            <p className="text-[10px] text-slate-500">Where found</p>
          </div>
          <div className="border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Top 3</p>
            <p className="text-2xl font-black tabular-nums text-emerald-600">{solv.toFixed(1)}%</p>
            <p className="text-[10px] text-slate-500">Top 3 on {top3Count} of {total} points</p>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1">
            {LEGEND.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-[10px] font-bold text-slate-500">{l.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border-2 border-dashed border-slate-400 shrink-0" />
              <span className="text-[10px] font-bold text-slate-500">Center</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top competitors */}
      {competitors.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Top competitors (by grid presence)</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
                <th className="py-1 pr-2 w-8">#</th>
                <th className="py-1 pr-2">Business</th>
                <th className="py-1 px-2 text-right">Coverage</th>
                <th className="py-1 px-2 text-right">Avg rank</th>
                <th className="py-1 pl-2 text-right">Top 3</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-emerald-50 font-bold">
                <td className="py-1 pr-2 text-emerald-700">You</td>
                <td className="py-1 pr-2 truncate max-w-0 w-full">{target}</td>
                <td className="py-1 px-2 text-right tabular-nums">{Math.round(coverage)}%</td>
                <td className="py-1 px-2 text-right tabular-nums">{arp !== null ? arp.toFixed(2) : '—'}</td>
                <td className="py-1 pl-2 text-right tabular-nums">{solv.toFixed(1)}%</td>
              </tr>
              {competitors.map((c, i) => (
                <tr key={c.key} className="border-t border-slate-100">
                  <td className="py-1 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-1 pr-2 truncate max-w-0 w-full">
                    {c.name}
                    {c.avgRating != null && <span className="text-slate-400"> · ★{c.avgRating.toFixed(1)}</span>}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">{Math.round(c.coverage)}%</td>
                  <td className="py-1 px-2 text-right tabular-nums">{c.arp !== null ? c.arp.toFixed(2) : '—'}</td>
                  <td className="py-1 pl-2 text-right tabular-nums">{c.solv.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Visibility by distance */}
      {rings.length > 1 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Visibility by distance from center</p>
          <div className="space-y-1">
            {rings.map((r) => (
              <div key={r.ring} className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-400 w-16 shrink-0 tabular-nums">
                  {r.ring === 0 ? 'Center' : `~${(r.distanceKm / 1.609344).toFixed(1)} mi`}
                </span>
                <div className="flex-1 min-w-0 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${r.top3Pct >= 50 ? 'bg-emerald-500' : r.foundCount > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                    style={{ width: `${Math.round((r.foundCount / r.pointCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-600 w-20 shrink-0 text-right tabular-nums">
                  {r.avgRank != null ? `avg #${r.avgRank}` : 'not found'}
                </span>
                <span className="text-[10px] text-slate-400 w-14 shrink-0 text-right tabular-nums">{r.foundCount}/{r.pointCount} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
