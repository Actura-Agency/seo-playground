'use client';

import { useState, lazy, Suspense } from 'react';
import { LANGUAGES } from '@/lib/geo-options';
import { QUEUE_MODES, type QueueMode, type Depth } from './grid-pricing';

const MapPicker = lazy(() => import('./MapPicker'));

interface Props {
  defaults: {
    keyword: string;
    location: string;
    locationCoordinate: string;
    defaultCenter: string;
    language: string;
    device: string;
    os: string;
    depth: string;
    minRating: string;
    timeFilter: string;
    gridMode?: boolean;
    forceGridMode?: boolean;
    gridSize?: string;
    spacingKm?: string;
    gridTarget?: string;
    queueMode?: string;
  };
}


// Live requests are throttled to 6 in flight; each point currently takes ~8-10s on DataForSEO's side.
const LIVE_SECONDS_PER_BATCH = 9;
const LIVE_CONCURRENCY = 6;

function formatCost(n: number) {
  return `$${n.toFixed(4)}`;
}

function formatLiveDuration(totalPoints: number) {
  const seconds = Math.ceil(totalPoints / LIVE_CONCURRENCY) * LIVE_SECONDS_PER_BATCH;
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.ceil(seconds / 60)} min`;
}

// 1 mile = 1.609344 km (exact, international mile).
const KM_PER_MILE = 1.609344;
const MILE_SPACING_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** Snaps an arbitrary miles value (e.g. converted from an old saved km spacing) to the nearest preset option. */
function nearestMilePreset(miles: number): number {
  return MILE_SPACING_OPTIONS.reduce((closest, option) =>
    Math.abs(option - miles) < Math.abs(closest - miles) ? option : closest,
  );
}

export default function LocalFinderForm({ defaults }: Props) {
  const isGrid = defaults.forceGridMode === true;

  const [device, setDevice] = useState(defaults.device || 'desktop');
  const [coordinate, setCoordinate] = useState(defaults.locationCoordinate || defaults.defaultCenter);
  const [isLoading, setIsLoading] = useState(false);
  const [gridSize, setGridSize] = useState(parseInt(defaults.gridSize ?? '11', 10));
  // The grid-generation math (generateGridCoords) still works in kilometers — spacingKm is
  // derived from the user-facing miles value right before it's used, per KM_PER_MILE above.
  const [spacingMiles, setSpacingMiles] = useState(
    nearestMilePreset(parseFloat(defaults.spacingKm ?? String(KM_PER_MILE)) / KM_PER_MILE),
  );
  const spacingKm = spacingMiles * KM_PER_MILE;
  const [queueMode, setQueueMode] = useState<QueueMode>((defaults.queueMode as QueueMode) || 'standard');
  const [depth, setDepth] = useState<Depth>(defaults.depth === '20' ? 20 : 10);
  const effectiveDepth: Depth = queueMode === 'live' ? 20 : depth;

  const osOptions =
    device === 'mobile'
      ? [{ value: 'android', label: 'Android' }, { value: 'ios', label: 'iOS' }]
      : [{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }];

  const defaultOs = osOptions.some((o) => o.value === defaults.os) ? defaults.os : osOptions[0].value;

  return (
    <form method="GET" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" onSubmit={() => setIsLoading(true)}>
      {/* Keyword */}
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
          Keyword <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          name="keyword"
          defaultValue={defaults.keyword}
          placeholder="e.g. plumber, italian restaurant, dentist…"
          required
          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:bg-slate-800"
        />
      </div>

      {!isGrid && (
        /* Language */
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
            Language <span className="text-red-400">*</span>
          </label>
          <select
            name="language"
            defaultValue={defaults.language || 'English'}
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
          >
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      )}

      {isGrid && (
        /* Target business */
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
            Target business <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="grid_target"
            defaultValue={defaults.gridTarget}
            placeholder="e.g. Best Plumbing or bestplumbing.com"
            required
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:bg-slate-800"
          />
          <p className="text-[11px] text-slate-400 mt-1">Name or domain — partial match, case-insensitive.</p>
        </div>
      )}

      {/* Map */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400">
            {isGrid ? 'Grid center (map)' : 'Location (map)'} <span className="text-red-400">*</span>
          </label>
          {coordinate && (
            <button
              type="button"
              onClick={() => setCoordinate('')}
              className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-2">
          <Suspense fallback={<div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
            <MapPicker
              coordinate={coordinate}
              onChange={setCoordinate}
              showGrid={isGrid && !!coordinate}
              gridSize={isGrid ? gridSize : undefined}
              spacingKm={isGrid ? spacingKm : undefined}
            />
          </Suspense>
          <input
            type="text"
            name="location_coordinate"
            value={coordinate}
            onChange={(e) => setCoordinate(e.target.value)}
            placeholder="Click on the map to set a point — or type lat,lng"
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-700 dark:text-slate-300 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800"
          />
          {coordinate && (
            <p className="text-[11px] text-blue-600">
              {isGrid ? 'Grid will be centered on this point.' : 'Coordinates active — search will be centered on this point.'}
            </p>
          )}
        </div>
      </div>

      {isGrid ? (
        /* Grid-specific fields */
        <>
          {/* Language: always English for geo-grid, so no field is shown — see feedback that it added no value. */}
          <input type="hidden" name="language" value="English" />

          {/* Grid size + spacing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Grid size</label>
              <select
                name="grid_size"
                value={gridSize}
                onChange={(e) => setGridSize(parseInt(e.target.value, 10))}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="3">3×3 (9 points)</option>
                <option value="5">5×5 (25 points)</option>
                <option value="7">7×7 (49 points)</option>
                <option value="9">9×9 (81 points)</option>
                <option value="11">11×11 (121 points)</option>
                <option value="13">13×13 (169 points)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Spacing (mi)</label>
              <input type="hidden" name="spacing_km" value={spacingKm} />
              <select
                value={spacingMiles}
                onChange={(e) => setSpacingMiles(parseFloat(e.target.value))}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                {MILE_SPACING_OPTIONS.map((mi) => (
                  <option key={mi} value={mi}>{mi} mi</option>
                ))}
              </select>
            </div>
          </div>

          {/* Queue mode */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400">API mode</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Results</span>
                <div
                  role="group"
                  aria-label="Results per point"
                  title={queueMode === 'live' ? 'Live costs the same at either depth, so it always returns the top 20.' : undefined}
                  className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  {([10, 20] as const).map((d) => {
                    const on = effectiveDepth === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        disabled={queueMode === 'live'}
                        onClick={() => setDepth(d)}
                        className={`px-2.5 py-1 text-[10px] font-black transition-colors disabled:cursor-not-allowed ${
                          on
                            ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                            : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                      >
                        Top {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <input type="hidden" name="queue_mode" value={queueMode} />
            <input type="hidden" name="depth" value={effectiveDepth} />
            <div className="grid grid-cols-3 gap-2">
              {QUEUE_MODES.map((mode) => {
                const active = queueMode === mode.value;
                const totalPoints = gridSize * gridSize;
                const estCost = formatCost(totalPoints * mode.cost[effectiveDepth]);
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setQueueMode(mode.value)}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className={`text-xs font-black ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {mode.label}
                    </span>
                    <span className={`text-[10px] font-mono ${active ? 'text-blue-500' : 'text-slate-400'}`}>{estCost}</span>
                    <span className="text-[10px] text-slate-400">{mode.wait}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {queueMode === 'live' ? (
                <>Blocks the page for {formatLiveDuration(gridSize * gridSize)} — DataForSEO’s live endpoint has slowed down, so large grids can take several minutes. Live is a flat price, so it always returns the top 20.</>
              ) : queueMode === 'priority' ? (
                <>Tasks are queued with DataForSEO’s high-priority flag. The page will auto-refresh every 10 seconds until results are ready.</>
              ) : (
                <>Tasks are queued for standard background processing. The page will check every 10 seconds — or you can come back later.</>
              )}
            </p>
          </div>
        </>
      ) : (
        /* Standard local finder fields */
        <>
          {/* Device / OS / Depth */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Device</label>
              <select
                name="device"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">OS</label>
              <select
                name="os"
                defaultValue={defaultOs}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                {osOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Depth</label>
              <select
                name="depth"
                defaultValue={defaults.depth || '20'}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Minimum rating</label>
              <select
                name="min_rating"
                defaultValue={defaults.minRating || ''}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="">No filter</option>
                <option value="3.5">3.5+</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Hours filter</label>
              <select
                name="time_filter"
                defaultValue={defaults.timeFilter || ''}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="">None</option>
                <option value="open_now">Open now</option>
                <option value="24_hours">Open 24/7</option>
              </select>
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 dark:hover:bg-blue-500 dark:hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {isGrid ? 'Running grid…' : 'Searching…'}
          </span>
        ) : (isGrid ? 'Run geo-grid' : 'Search')}
      </button>
    </form>
  );
}
