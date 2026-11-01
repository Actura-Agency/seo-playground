import type { GridScheduleFrequency } from '@/lib/db';

/** Every automation time (and every scan date shown in geo-grid history) is in the team's timezone. */
export const AUTOMATION_TZ = 'America/Los_Angeles';
export const AUTOMATION_TZ_LABEL = 'Pacific Time';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface ScheduleTiming {
  frequency: GridScheduleFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
}

/** How far `tz`'s wall clock is ahead of UTC at instant `utcMs` (negative west of Greenwich). */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallAsUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant at which `tz`'s wall clock reads the given date and time (DST-aware). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes: the first offset guess can be on the wrong side of a DST switch.
  const first = wallAsUtc - tzOffsetMs(wallAsUtc, tz);
  return wallAsUtc - tzOffsetMs(first, tz);
}

/**
 * The first scheduled instant strictly after `after`. Runs missed while the server was down are
 * never replayed one by one: the scheduler always asks for the next slot after "now".
 */
export function computeNextRun(s: ScheduleTiming, after: number, tz = AUTOMATION_TZ): number {
  const [hour, minute] = s.time_of_day.split(':').map(Number);
  const today = new Date(after + tzOffsetMs(after, tz));
  for (let i = 0; i <= 62; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
    if (s.frequency === 'weekly' && d.getUTCDay() !== s.day_of_week) continue;
    if (s.frequency === 'monthly' && d.getUTCDate() !== s.day_of_month) continue;
    const at = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, minute, tz);
    if (at > after) return at;
  }
  throw new Error(`No upcoming run found for schedule ${JSON.stringify(s)}`);
}

/** The calendar day ("2026-11-01") an instant falls on in the automation timezone. */
export function zonedDayKey(ts: number, tz = AUTOMATION_TZ): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

/** [start, end) instants of a "YYYY-MM-DD" day in the automation timezone (23 or 25 h on DST days); null if malformed. */
export function zonedDayRange(day: string, tz = AUTOMATION_TZ): [number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return [
    zonedTimeToUtc(y, mo, d, 0, 0, tz),
    zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz),
  ];
}

/** "Sun, Nov 1, 2026" from "2026-11-01". */
export function formatDayKey(day: string): string {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

/** "8:00 AM" from "08:00". */
export function formatTimeOfDay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** "Daily · 8:00 AM", "Weekly · Mon · 8:00 AM", "Monthly · 15th · 8:00 AM". */
export function describeSchedule(s: ScheduleTiming): string {
  const time = formatTimeOfDay(s.time_of_day);
  if (s.frequency === 'weekly') return `Weekly · ${WEEKDAYS[s.day_of_week ?? 0].slice(0, 3)} · ${time}`;
  if (s.frequency === 'monthly') return `Monthly · ${ordinal(s.day_of_month ?? 1)} · ${time}`;
  return `Daily · ${time}`;
}

/** "Thu, Oct 30, 8:00 AM" in the automation timezone. */
export function formatScheduleDate(ts: number, tz = AUTOMATION_TZ): string {
  return new Date(ts).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz,
  });
}

export interface NewScanSettings {
  keyword: string;
  target: string;
  center: string;
  gridSize: number;
  spacingKm: number;
  language: string;
}

/**
 * Validates scan settings sent straight from the Geo-Grid form ("Schedule instead of running
 * now"), for a client that has no saved scan yet. Returns null if anything is missing or invalid.
 */
export function parseNewScanSettings(get: (key: string) => string | null | undefined): NewScanSettings | null {
  const keyword = (get('keyword') ?? '').trim().slice(0, 200);
  const target = (get('grid_target') ?? '').trim().slice(0, 200);
  const coord = (get('location_coordinate') ?? '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  const gridSize = parseInt(get('grid_size') ?? '', 10);
  const spacingKm = parseFloat(get('spacing_km') ?? '');
  if (!keyword || !target || !coord) return null;
  const lat = Number(coord[1]);
  const lng = Number(coord[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Same bounds the manual scan enforces (3x3 to 13x13); spacing stays within the form's 0.25-5 mi presets.
  if (![3, 5, 7, 9, 11, 13].includes(gridSize)) return null;
  if (!(spacingKm >= 0.4 && spacingKm <= 8.1)) return null;
  return {
    keyword, target,
    center: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    gridSize, spacingKm,
    language: (get('language') ?? '').trim() || 'English',
  };
}

/** Average runs per month, for the monthly cost estimate. */
export function runsPerMonth(frequency: GridScheduleFrequency): number {
  return frequency === 'daily' ? 30.4 : frequency === 'weekly' ? 4.35 : 1;
}
