'use client';

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import { computeCompetitors, computeGridSummary, computeRingStats, type CompetitorSummary } from './grid-insights';

const GridMap = lazy(() => import('./GridMap'));

interface Props {
  results: GridPoint[];
  gridSize: number;
  spacingKm: number;
  keyword: string;
  target: string;
  cost?: number;
  /** Grid center "lat,lng" and search language — needed only for the on-demand business-location lookup. */
  center: string;
  language: string;
}

// One distinct shade per rank 1-8 (a green-to-red gradient) so adjacent markers read as visibly
// different, even though the legend below groups them into coarser bands for readability.
const RANK_GRADIENT = ['#1A6600', '#59810A', '#969C15', '#CBB21D', '#FFC826', '#EF9E1E', '#DD7015', '#CC430D'];

function rankColor(rank: number | null): string {
  if (rank === null) return '#94a3b8';
  if (rank >= RANK_GRADIENT.length + 1) return '#BA1604';
  return RANK_GRADIENT[rank - 1];
}

/** Small legend swatch — a star for #1 (matching the real marker shape), a plain square otherwise. */
function LegendSwatch({ color, star }: { color: string; star?: boolean }) {
  if (star) {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24">
        <path
          d="M12,2 L15.2,7.6 L21.5,8.9 L17.2,13.7 L17.9,20.1 L12,17.5 L6.1,20.1 L6.8,13.7 L2.5,8.9 L8.8,7.6 Z"
          fill={color} stroke={color} strokeWidth={3} strokeLinejoin="round"
        />
      </svg>
    );
  }
  return <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />;
}

/** Compact Coverage/ARP/SoLV badges shown on both the target's row and each competitor's row, so the columns line up. */
function MetricBadges({ coverage, arp, solv }: { coverage: number; arp: number | null; solv: number }) {
  return (
    <div className="hidden sm:flex items-center gap-1 shrink-0">
      <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 w-14">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">COV</span>
        <span className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums">{Math.round(coverage)}%</span>
      </div>
      <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 w-14">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">ARP</span>
        <span className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums">{arp !== null ? arp.toFixed(2) : '—'}</span>
      </div>
      <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 w-14">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Top 3%</span>
        <span className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums">{solv.toFixed(2)}%</span>
      </div>
    </div>
  );
}

export default function GridResults({ results, gridSize, spacingKm, keyword, target, cost, center, language }: Props) {
  const [highlight, setHighlight] = useState<CompetitorSummary | null>(null);
  const [highlightLocation, setHighlightLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingBusiness, setLocatingBusiness] = useState(false);
  // Only set once the user explicitly clicks "View location" — the lookup costs real DataForSEO
  // credits, so it must never fire just from selecting a competitor to view on the grid.
  const [locationRequestedFor, setLocationRequestedFor] = useState<string | null>(null);
  // Session-scoped cache so re-viewing a competitor you already looked up is instant and free —
  // only a brand-new business triggers a real (Priority-queue, ~1 min) DataForSEO lookup.
  const locationCache = useRef(new Map<string, { lat: number; lng: number }>());

  // Switching which competitor is highlighted always clears any location pin/request — a lookup
  // is scoped to one business and must never carry over or auto-restart for the next one.
  useEffect(() => {
    setHighlightLocation(null);
    setLocatingBusiness(false);
    setLocationRequestedFor(null);
  }, [highlight?.key]);

  // Starts a Priority-queue business-location lookup for the requested competitor and polls for
  // it, showing a small spinner (via locatingBusiness) while waiting. Only runs when the user has
  // clicked "View location" (locationRequestedFor set) — never automatically.
  useEffect(() => {
    if (!locationRequestedFor) return;
    const cid = locationRequestedFor;
    const cached = locationCache.current.get(cid);
    if (cached) {
      setHighlightLocation(cached);
      return;
    }
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    setHighlightLocation(null);
    setLocatingBusiness(true);

    const poll = async (taskId: string) => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/business-location/${taskId}`);
        const data = await res.json() as { status: string; lat?: number; lng?: number };
        if (cancelled) return;
        if (data.status === 'done' && data.lat != null && data.lng != null) {
          const loc = { lat: data.lat, lng: data.lng };
          locationCache.current.set(cid, loc);
          setHighlightLocation(loc);
          setLocatingBusiness(false);
          return;
        }
        if (data.status === 'pending') {
          pollTimer = setTimeout(() => poll(taskId), 30_000);
        } else {
          setLocatingBusiness(false); // 'error' → give up; no pin ever appears for this business.
        }
      } catch {
        pollTimer = setTimeout(() => poll(taskId), 30_000);
      }
    };

    fetch('/api/business-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, center, language }),
    })
      .then((res) => res.json())
      .then((data: { taskId?: string }) => {
        if (cancelled) return;
        if (data.taskId) {
          pollTimer = setTimeout(() => poll(data.taskId!), 30_000);
        } else {
          setLocatingBusiness(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLocatingBusiness(false);
      });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [locationRequestedFor, center, language]);

  const { foundCount, top3Count: top3, coverage, arp, solv } = computeGridSummary(results);

  const competitors = useMemo(() => computeCompetitors(results), [results]);
  const topCompetitors = competitors.slice(0, 5);
  const ringStats = useMemo(() => computeRingStats(results, gridSize, spacingKm), [results, gridSize, spacingKm]);

  const legend = [
    { color: '#1A6600', label: '#1', star: true },
    { color: '#59810A', label: '#2-3' },
    { color: '#FFC826', label: '#4-5' },
    { color: '#DD7015', label: '#6-10' },
    { color: '#BA1604', label: '#11-20' },
    { color: '#94a3b8', label: 'Not found' },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl px-3 sm:px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Coverage</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 tabular-nums">{Math.round(coverage)}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Found on {foundCount} of {results.length} points</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-3 sm:px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ARP</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 tabular-nums">{arp !== null ? arp.toFixed(2) : '—'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Average rank where found</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-3 sm:px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Top 3%</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5 tabular-nums">{solv.toFixed(2)}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Top 3 on {top3} of {results.length} points</p>
        </div>
      </div>

      {/* Competitive landscape */}
      {topCompetitors.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 mb-1">
            <p className="text-sm font-black text-slate-900 dark:text-white">Competitive landscape</p>
            <p className="text-[10px] text-slate-400">Ranked by grid presence</p>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">
            Businesses appearing in the top 20 across the grid, compared to your own visibility.
          </p>

          <div className="space-y-2">
            {/* Target row, for direct comparison */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 w-8 sm:w-14 shrink-0">You</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1 min-w-0 truncate">{target}</span>
              <MetricBadges coverage={coverage} arp={arp} solv={solv} />
              <div className="flex-1 max-w-[120px] h-2 bg-emerald-100 dark:bg-emerald-900 rounded-full overflow-hidden hidden sm:block">
                <div className="h-full bg-emerald-500" style={{ width: `${solv}%` }} />
              </div>
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 tabular-nums w-10 text-right">{Math.round(solv)}%</span>
            </div>

            {topCompetitors.map((c, i) => {
              const isActive = highlight?.key === c.key;
              return (
                <div
                  key={c.key}
                  className={`flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900'
                      : 'bg-slate-50 dark:bg-slate-800 border-transparent'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-8 sm:w-14 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {c.appearances}/{c.totalPoints} points · avg #{c.avgRank}
                      {c.avgRating != null ? ` · ★${c.avgRating.toFixed(1)}` : ''}
                    </p>
                  </div>
                  <MetricBadges coverage={c.coverage} arp={c.arp} solv={c.solv} />
                  <div className="flex-1 max-w-[120px] h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                    <div className="h-full bg-blue-500" style={{ width: `${c.solv}%` }} />
                  </div>
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300 tabular-nums w-10 text-right">{Math.round(c.solv)}%</span>
                  <button
                    type="button"
                    onClick={() => setHighlight(isActive ? null : c)}
                    className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg shrink-0 transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-900 text-blue-600 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950'
                    }`}
                  >
                    {isActive ? 'Showing ✓' : 'View'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Map card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900">
              {highlight ? highlight.name : keyword}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {highlight ? (
                <>Competitor · avg #{highlight.avgRank} · {highlight.appearances}/{highlight.totalPoints} points</>
              ) : (
                <>Target: <span className="font-bold text-slate-600">{target}</span></>
              )}
              {' · '}{gridSize}×{gridSize} points
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {cost !== undefined && (
              <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>
            )}
            {highlight?.cid && !highlightLocation && (
              <button
                type="button"
                onClick={() => setLocationRequestedFor(highlight.cid!)}
                disabled={locatingBusiness}
                className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {locatingBusiness ? 'Locating…' : 'View location'}
              </button>
            )}
            {highlight ? (
              <button
                type="button"
                onClick={() => setHighlight(null)}
                className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
              >
                ← Back to target
              </button>
            ) : (
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                Click a pin for details
              </span>
            )}
          </div>
        </div>

        {/* Mini legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <LegendSwatch color={item.color} star={item.star} />
              <span className="text-[10px] font-bold text-slate-500">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200">
            <div className="w-3 h-3 rounded-sm border-2 border-dashed border-slate-400" />
            <span className="text-[10px] font-bold text-slate-500">Center</span>
          </div>
        </div>

        {/* Map */}
        <Suspense fallback={
          <div className="w-full h-[420px] sm:h-[520px] rounded-xl bg-slate-100 animate-pulse flex items-center justify-center">
            <p className="text-sm text-slate-400 font-medium">Loading map…</p>
          </div>
        }>
          <GridMap
            key={highlight?.key ?? 'target'}
            points={results}
            gridSize={gridSize}
            target={target}
            highlightKey={highlight?.key}
            highlightName={highlight?.name}
            highlightLocation={highlightLocation}
            locatingBusiness={locatingBusiness}
          />
        </Suspense>
      </div>

      {/* Visibility by distance from center */}
      {ringStats.length > 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-sm font-black text-slate-900 dark:text-white mb-1">Visibility by distance</p>
          <p className="text-[11px] text-slate-400 mb-4">
            How far from the center point the target stays visible — useful to see the real edge of your service area.
          </p>
          <div className="space-y-2">
            {ringStats.map((r) => (
              <div key={r.ring} className="flex items-center gap-2 sm:gap-3">
                <span className="text-[10px] font-black text-slate-400 w-14 sm:w-20 shrink-0 tabular-nums">
                  {r.ring === 0 ? 'Center' : `~${(r.distanceKm / 1.609344).toFixed(1)} mi`}
                </span>
                <div className="flex-1 min-w-0 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${r.top3Pct >= 50 ? 'bg-emerald-500' : r.foundCount > 0 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    style={{ width: `${Math.round((r.foundCount / r.pointCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 w-16 sm:w-28 shrink-0 text-right tabular-nums">
                  {r.avgRank != null ? `avg #${r.avgRank}` : 'not found'}
                </span>
                <span className="text-[10px] text-slate-400 w-12 sm:w-16 shrink-0 text-right tabular-nums">
                  {r.foundCount}/{r.pointCount} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rank distribution mini-grid (fallback for points without geo) */}
      {results.some((p) => p.lat == null) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Distribution (grid without coordinates)</p>
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
            {results.map((p, i) => {
              const color = rankColor(p.rank);
              const half = Math.floor(gridSize / 2);
              const isCenter = p.row === half && p.col === half;
              return (
                <div
                  key={i}
                  title={p.rank != null ? `#${p.rank}` : 'Not found'}
                  style={{
                    width: 36, height: 36,
                    background: color,
                    borderRadius: 6,
                    border: isCenter ? '2px dashed rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: 'white',
                  }}
                >
                  {p.rank ?? '—'}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
