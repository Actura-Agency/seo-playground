'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface ScanRow {
  id: string;
  ts: number;
  keyword: string;
  target: string;
  center: string;
  gridSize: number;
  spacingMi: number;
  cost: number | null;
  pending: boolean;
  /** Queued scan that never finished; its stats only cover the points that arrived. */
  timedOut: boolean;
  auto: boolean;
  scheduleName: string | null;
  visibility: number | null;
  found: number | null;
  points: number | null;
  avgRank: number | null;
  rerunUrl: string;
}

type SortKey = 'ts' | 'target' | 'keyword' | 'visibility' | 'found';

const PER_PAGE = 50;
const inputCls = 'px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';

/** Same business typed slightly differently ("Joe's Plumbing " vs "joe's plumbing") counts as one company. */
const companyKey = (target: string) => target.trim().toLowerCase();

// Dates read in the team's timezone (matches geo-grid history and automation).
function formatDate(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  });
}

/** "YYYY-MM-DD" date in Pacific time, comparable with <input type="date"> values. */
function pacificDay(ts: number) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export default function ScansTable({ rows }: { rows: ScanRow[] }) {
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState<'' | 'manual' | 'auto'>('');
  const [gridSize, setGridSize] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ts');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const companies = useMemo(() => {
    const byKey = new Map<string, { name: string; count: number }>();
    for (const r of rows) {
      const k = companyKey(r.target);
      const c = byKey.get(k);
      if (c) c.count++;
      else byKey.set(k, { name: r.target.trim(), count: 1 });
    }
    return Array.from(byKey.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows]);

  const gridSizes = useMemo(() => [...new Set(rows.map((r) => r.gridSize))].sort((a, b) => a - b), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q && ![r.target, r.keyword, r.center, r.scheduleName ?? ''].some((v) => v.toLowerCase().includes(q))) return false;
      if (company && companyKey(r.target) !== company) return false;
      if (source === 'auto' && !r.auto) return false;
      if (source === 'manual' && r.auto) return false;
      if (gridSize && r.gridSize !== Number(gridSize)) return false;
      if (from && pacificDay(r.ts) < from) return false;
      if (to && pacificDay(r.ts) > to) return false;
      return true;
    });
    const dir = sortAsc ? 1 : -1;
    // Scans with no stats yet (pending) always sort last for the number columns.
    const num = (v: number | null) => (v === null ? (sortAsc ? Infinity : -Infinity) : v);
    out.sort((a, b) => {
      switch (sortKey) {
        case 'target': return dir * a.target.localeCompare(b.target, undefined, { sensitivity: 'base' }) || b.ts - a.ts;
        case 'keyword': return dir * a.keyword.localeCompare(b.keyword, undefined, { sensitivity: 'base' }) || b.ts - a.ts;
        case 'visibility': return dir * (num(a.visibility) - num(b.visibility)) || b.ts - a.ts;
        case 'found': return dir * (num(a.found) - num(b.found)) || b.ts - a.ts;
        default: return dir * (a.ts - b.ts);
      }
    });
    return out;
  }, [rows, query, company, source, gridSize, from, to, sortKey, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);
  const anyFilter = query || company || source || gridSize || from || to;

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'target' || key === 'keyword'); }
    setPage(0);
  }

  function clearFilters() {
    setQuery(''); setCompany(''); setSource(''); setGridSize(''); setFrom(''); setTo(''); setPage(0);
  }

  const Header = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-3 py-2.5 ${className}`}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
        {label}
        {sortKey === k && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          placeholder="Search company, keyword or coordinates…"
          className={`${inputCls} w-full`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select value={company} onChange={(e) => { setCompany(e.target.value); setPage(0); }} className={`${inputCls} min-w-0 max-w-full sm:max-w-xs`}>
            <option value="">All companies ({companies.length})</option>
            {companies.map(([k, c]) => <option key={k} value={k}>{c.name} ({c.count})</option>)}
          </select>
          <select value={source} onChange={(e) => { setSource(e.target.value as '' | 'manual' | 'auto'); setPage(0); }} className={inputCls}>
            <option value="">Manual + Auto</option>
            <option value="manual">Manual only</option>
            <option value="auto">Auto only</option>
          </select>
          <select value={gridSize} onChange={(e) => { setGridSize(e.target.value); setPage(0); }} className={inputCls}>
            <option value="">Any grid size</option>
            {gridSizes.map((g) => <option key={g} value={g}>{g}×{g}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400">
            From
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className={inputCls} />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400">
            To
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className={inputCls} />
          </label>
          {anyFilter && (
            <button type="button" onClick={clearFilters} className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
          {filtered.length === rows.length ? `${rows.length} scans` : `${filtered.length} of ${rows.length} scans`}
        </div>
        {visible.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">{rows.length === 0 ? 'No scans yet.' : 'No scans match these filters.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <Header k="ts" label="Date" className="pl-5" />
                  <Header k="target" label="Company" />
                  <Header k="keyword" label="Keyword" />
                  <th className="px-3 py-2.5 uppercase tracking-widest">Grid</th>
                  <Header k="visibility" label="Visibility" />
                  <Header k="found" label="Found" />
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {visible.map((r) => {
                  const href = `/dashboard/geo-grid?grid_history_id=${r.id}#results`;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="pl-5 pr-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400 text-[12px]">
                        <a href={href} className="hover:text-blue-600">{formatDate(r.ts)}</a>
                      </td>
                      <td className="px-3 py-2.5 min-w-[160px]">
                        <a href={href} className="font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600">{r.target}</a>
                        {r.auto && (
                          <span className="ml-1.5 text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 px-1.5 py-0.5 rounded" title={r.scheduleName ? `Schedule: ${r.scheduleName}` : 'Started by an automation schedule'}>Auto</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 min-w-[140px]">{r.keyword}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400">
                        {r.gridSize}×{r.gridSize} · {r.spacingMi.toFixed(2)} mi
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.pending ? (
                          <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Pending</span>
                        ) : r.timedOut ? (
                          <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded" title="DataForSEO never returned every point, so its stats would be misleading">Timed out</span>
                        ) : r.visibility !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${r.visibility}%` }} />
                            </div>
                            <span className="text-[11px] font-black text-emerald-600 tabular-nums">{r.visibility}%</span>
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {r.timedOut ? `${r.points ?? 0} of ${r.gridSize * r.gridSize} points arrived`
                          : r.found !== null && r.points !== null ? `${r.found}/${r.points}${r.avgRank !== null ? ` · avg #${r.avgRank}` : ''}` : '—'}
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap text-right">
                        <a href={`/dashboard/geo-grid/automation?from=${r.id}`} className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 transition-colors mr-3">Schedule</a>
                        <a href={r.rerunUrl} className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-800 transition-colors">Re-run ↻</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors">
              ← Previous
            </button>
            <span className="text-[11px] tabular-nums text-slate-400">Page {safePage + 1} of {pageCount}</span>
            <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
