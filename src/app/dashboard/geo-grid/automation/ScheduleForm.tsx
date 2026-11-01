'use client';

import { lazy, Suspense, useState } from 'react';
import PendingButton from '@/components/PendingButton';
import { SCAN_COST, SCAN_WAIT, type Depth } from '../../local-finder/grid-pricing';
import { GRID_SIZES, KM_PER_MILE, MILE_SPACING_OPTIONS, nearestMilePreset } from '../../local-finder/grid-form-options';
import { WEEKDAYS, AUTOMATION_TZ_LABEL, runsPerMonth } from '../../local-finder/grid-schedule';
import { saveScheduleAction } from './actions';

const MapPicker = lazy(() => import('../../local-finder/MapPicker'));

type Frequency = 'daily' | 'weekly' | 'monthly';

export interface ScheduleFormValues {
  keyword: string;
  target: string;
  /** "lat,lng"; empty for a brand-new client until a point is picked. */
  center: string;
  gridSize: number;
  spacingKm: number;
  label: string;
  frequency: Frequency;
  dayOfWeek: number;
  dayOfMonth: number;
  timeOfDay: string;
  depth: Depth;
}

interface Props {
  /** Set when editing an existing schedule; otherwise the form creates a new one. */
  scheduleId?: number;
  /** Pre-filled values: from the schedule being edited, a saved scan, the Geo-Grid form, or blank. */
  initial: ScheduleFormValues;
  /** Where the map starts when there is no center yet (the app's default coordinates setting). */
  defaultCenter: string;
  title: string;
  /** Optional one-line note under the title. */
  note?: string;
}

const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';
const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 transition-all';

export default function ScheduleForm({ scheduleId, initial, defaultCenter, title, note }: Props) {
  const [coordinate, setCoordinate] = useState(initial.center || defaultCenter);
  const [gridSize, setGridSize] = useState(initial.gridSize);
  const [spacingMiles, setSpacingMiles] = useState(nearestMilePreset(initial.spacingKm / KM_PER_MILE));
  const spacingKm = spacingMiles * KM_PER_MILE;
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [depth, setDepth] = useState<Depth>(initial.depth);
  const perRun = gridSize * gridSize * SCAN_COST[depth];

  return (
    <form action={saveScheduleAction} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
      {scheduleId && <input type="hidden" name="schedule_id" value={scheduleId} />}
      {/* Geo-grid scans always search in English (same as the Geo-Grid form). */}
      <input type="hidden" name="language" value="English" />

      <div>
        <p className="text-sm font-black text-slate-900 dark:text-white">{title}</p>
        {note && <p className="text-[11px] text-blue-600 mt-0.5">{note}</p>}
      </div>

      {/* What to scan: the same fields as the Geo-Grid form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Keyword <span className="text-red-400">*</span></label>
          <input type="text" name="keyword" defaultValue={initial.keyword} required maxLength={200} placeholder="e.g. plumber, italian restaurant, dentist…" className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">Searched on every scheduled run.</p>
        </div>
        <div>
          <label className={labelCls}>Target business <span className="text-red-400">*</span></label>
          <input type="text" name="grid_target" defaultValue={initial.target} required maxLength={200} placeholder="e.g. Best Plumbing or bestplumbing.com" className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">Name or domain — partial match, case-insensitive.</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400">
            Grid center (map) <span className="text-red-400">*</span>
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
              showGrid={!!coordinate}
              gridSize={gridSize}
              spacingKm={spacingKm}
            />
          </Suspense>
          <input
            type="text"
            name="location_coordinate"
            value={coordinate}
            onChange={(e) => setCoordinate(e.target.value)}
            required
            placeholder="Click on the map to set a point — or type lat,lng"
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-700 dark:text-slate-300 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Grid size</label>
          <select name="grid_size" value={gridSize} onChange={(e) => setGridSize(parseInt(e.target.value, 10))} className={inputCls}>
            {GRID_SIZES.map((g) => <option key={g} value={g}>{g}×{g} ({g * g} points)</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Spacing (mi)</label>
          <input type="hidden" name="spacing_km" value={spacingKm} />
          <select value={spacingMiles} onChange={(e) => setSpacingMiles(parseFloat(e.target.value))} className={inputCls}>
            {MILE_SPACING_OPTIONS.map((mi) => <option key={mi} value={mi}>{mi} mi</option>)}
          </select>
        </div>
      </div>

      {/* When to scan */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800" />

      <div>
        <label className={labelCls}>Name</label>
        <input type="text" name="label" defaultValue={initial.label} maxLength={100} placeholder="Defaults to the business name" className={inputCls} />
        <p className="text-[11px] text-slate-400 mt-1">Shown on the automation list.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Frequency</label>
          <input type="hidden" name="frequency" value={frequency} />
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(['daily', 'weekly', 'monthly'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={frequency === f}
                onClick={() => setFrequency(f)}
                className={`flex-1 px-2 py-2.5 text-xs font-black capitalize transition-colors ${
                  frequency === f
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                    : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Day</label>
          {frequency === 'weekly' ? (
            <select name="day_of_week" defaultValue={initial.dayOfWeek} className={inputCls}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          ) : frequency === 'monthly' ? (
            <select name="day_of_month" defaultValue={initial.dayOfMonth} className={inputCls}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Day {d}</option>)}
            </select>
          ) : (
            <p className="px-1 py-2.5 text-sm text-slate-400">Every day</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Time</label>
          <input type="time" name="time_of_day" defaultValue={initial.timeOfDay} required className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">{AUTOMATION_TZ_LABEL}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400">Results per point</label>
          <div
            role="group"
            aria-label="Results per point"
            className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
          >
            {([10, 20] as const).map((d) => {
              const on = depth === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDepth(d)}
                  className={`px-2.5 py-1 text-[10px] font-black transition-colors ${
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
        <input type="hidden" name="queue_mode" value="standard" />
        <input type="hidden" name="depth" value={depth} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 rounded-xl border border-blue-500 bg-blue-50 dark:bg-blue-950">
          <span className="text-xs font-black text-blue-700 dark:text-blue-400">
            <span className="font-mono text-blue-500">${perRun.toFixed(4)}</span> / scan
          </span>
          <span className="text-[10px] text-slate-400">≈ ${(perRun * runsPerMonth(frequency)).toFixed(2)} / month · {SCAN_WAIT}</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Results land in Grid Search History like a manual scan.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <PendingButton
          type="submit"
          pendingChildren="Saving…"
          className="flex-1 bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 dark:hover:bg-blue-500 dark:hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {scheduleId ? 'Save changes' : 'Create schedule'}
        </PendingButton>
        <a
          href="/dashboard/geo-grid/automation"
          className="px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
