import { describe, it, expect } from 'vitest';
import { computeNextRun, describeSchedule, zonedTimeToUtc, zonedDayKey, zonedDayRange, formatDayKey } from './grid-schedule';

const TZ = 'America/Los_Angeles';
const utc = (iso: string) => Date.parse(iso);

describe('zonedTimeToUtc', () => {
  it('converts Pacific Daylight Time (UTC-7)', () => {
    expect(zonedTimeToUtc(2026, 7, 15, 8, 0, TZ)).toBe(utc('2026-07-15T15:00:00Z'));
  });
  it('converts Pacific Standard Time (UTC-8)', () => {
    expect(zonedTimeToUtc(2026, 12, 15, 8, 0, TZ)).toBe(utc('2026-12-15T16:00:00Z'));
  });
});

describe('computeNextRun — daily', () => {
  const daily = { frequency: 'daily' as const, day_of_week: null, day_of_month: null, time_of_day: '08:00' };

  it('runs later today when the time has not passed yet', () => {
    // 6:00 AM PDT on Jul 15 → 8:00 AM PDT the same day
    expect(computeNextRun(daily, utc('2026-07-15T13:00:00Z'), TZ)).toBe(utc('2026-07-15T15:00:00Z'));
  });

  it('runs tomorrow once today\'s time has passed', () => {
    expect(computeNextRun(daily, utc('2026-07-15T15:00:00Z'), TZ)).toBe(utc('2026-07-16T15:00:00Z'));
  });

  it('uses the Pacific date, not the UTC date, late in the evening', () => {
    // 11:30 PM PDT on Jul 15 is already Jul 16 in UTC; next 8:00 AM is Jul 16 Pacific.
    expect(computeNextRun(daily, utc('2026-07-16T06:30:00Z'), TZ)).toBe(utc('2026-07-16T15:00:00Z'));
  });

  it('keeps 8:00 AM local across the November DST change', () => {
    // DST ends Sun Nov 1 2026: Oct 31 8 AM is PDT (15:00Z), Nov 1 8 AM is PST (16:00Z).
    expect(computeNextRun(daily, utc('2026-10-31T12:00:00Z'), TZ)).toBe(utc('2026-10-31T15:00:00Z'));
    expect(computeNextRun(daily, utc('2026-10-31T15:00:00Z'), TZ)).toBe(utc('2026-11-01T16:00:00Z'));
  });

  it('keeps 8:00 AM local across the March DST change', () => {
    // DST starts Sun Mar 8 2026.
    expect(computeNextRun(daily, utc('2026-03-07T16:00:00Z'), TZ)).toBe(utc('2026-03-08T15:00:00Z'));
  });
});

describe('computeNextRun — weekly', () => {
  const monday9 = { frequency: 'weekly' as const, day_of_week: 1, day_of_month: null, time_of_day: '09:30' };

  it('finds the next Monday', () => {
    // Thu Oct 29 2026 → Mon Nov 2 9:30 AM PST
    expect(computeNextRun(monday9, utc('2026-10-29T20:00:00Z'), TZ)).toBe(utc('2026-11-02T17:30:00Z'));
  });

  it('skips to the following week once Monday\'s time has passed', () => {
    expect(computeNextRun(monday9, utc('2026-11-02T17:30:00Z'), TZ)).toBe(utc('2026-11-09T17:30:00Z'));
  });
});

describe('computeNextRun — monthly', () => {
  const the28th = { frequency: 'monthly' as const, day_of_week: null, day_of_month: 28, time_of_day: '07:00' };

  it('runs on the 28th of the current month if still ahead', () => {
    expect(computeNextRun(the28th, utc('2027-02-10T12:00:00Z'), TZ)).toBe(utc('2027-02-28T15:00:00Z'));
  });

  it('rolls into next month (and next year) once passed', () => {
    expect(computeNextRun(the28th, utc('2026-12-29T00:00:00Z'), TZ)).toBe(utc('2027-01-28T15:00:00Z'));
  });
});

describe('describeSchedule', () => {
  it('reads naturally for each frequency', () => {
    expect(describeSchedule({ frequency: 'daily', day_of_week: null, day_of_month: null, time_of_day: '08:00' })).toBe('Daily · 8:00 AM');
    expect(describeSchedule({ frequency: 'weekly', day_of_week: 1, day_of_month: null, time_of_day: '13:05' })).toBe('Weekly · Mon · 1:05 PM');
    expect(describeSchedule({ frequency: 'monthly', day_of_week: null, day_of_month: 22, time_of_day: '00:00' })).toBe('Monthly · 22nd · 12:00 AM');
  });
});

describe('Pacific calendar days', () => {
  it('puts a late-evening Pacific scan on its Pacific date, not the UTC one', () => {
    // 2026-11-02 04:30 UTC is still Nov 1 at 8:30 PM in Seattle.
    expect(zonedDayKey(utc('2026-11-02T04:30:00Z'))).toBe('2026-11-01');
  });
  it('gives a normal day 24 hours and a DST day 25', () => {
    const [start, end] = zonedDayRange('2026-07-15')!;
    expect(start).toBe(utc('2026-07-15T07:00:00Z'));
    expect(end - start).toBe(24 * 3_600_000);
    const [s2, e2] = zonedDayRange('2026-11-01')!; // clocks fall back that morning
    expect(e2 - s2).toBe(25 * 3_600_000);
  });
  it('rejects malformed or impossible dates', () => {
    expect(zonedDayRange('2026-02-30')).toBeNull();
    expect(zonedDayRange('nov 1')).toBeNull();
  });
  it('formats a day for display', () => {
    expect(formatDayKey('2026-11-01')).toBe('Sun, Nov 1, 2026');
  });
});
