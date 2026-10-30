'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getGridEntry, getGridSchedule, createGridSchedule, updateGridSchedule, setGridScheduleEnabled,
  deleteGridSchedule, type GridScheduleTiming, type GridScheduleFrequency, type GridQueueMode,
} from '@/lib/db';
import { computeNextRun } from '../../local-finder/grid-schedule';

const PATH = '/dashboard/geo-grid/automation';

/** Reads and validates the schedule form's timing / mode fields; anything malformed falls back to a safe default. */
function parseTiming(formData: FormData, fallbackLabel: string): GridScheduleTiming {
  const frequency = (['daily', 'weekly', 'monthly'] as const).find((f) => f === formData.get('frequency')) ?? 'weekly';
  const queueMode = (['live', 'priority', 'standard'] as const).find((m) => m === formData.get('queue_mode')) ?? 'standard';
  const time = String(formData.get('time_of_day') ?? '');
  const dow = parseInt(String(formData.get('day_of_week') ?? ''), 10);
  const dom = parseInt(String(formData.get('day_of_month') ?? ''), 10);
  return {
    label: String(formData.get('label') ?? '').trim().slice(0, 100) || fallbackLabel,
    frequency: frequency as GridScheduleFrequency,
    day_of_week: frequency === 'weekly' ? (dow >= 0 && dow <= 6 ? dow : 1) : null,
    day_of_month: frequency === 'monthly' ? (dom >= 1 && dom <= 28 ? dom : 1) : null,
    time_of_day: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '08:00',
    queue_mode: queueMode as GridQueueMode,
    // Live is a flat price at either depth, so it always fetches the full 20 (same rule as manual scans).
    depth: queueMode !== 'live' && formData.get('depth') === '10' ? 10 : 20,
  };
}

/** Creates a schedule from a saved scan (`from`), or edits an existing one (`schedule_id`). */
export async function saveScheduleAction(formData: FormData) {
  const scheduleId = parseInt(String(formData.get('schedule_id') ?? ''), 10);
  if (scheduleId) {
    const existing = getGridSchedule(scheduleId);
    if (!existing) redirect(PATH);
    const timing = parseTiming(formData, existing.target);
    updateGridSchedule(scheduleId, timing, existing.enabled ? computeNextRun(timing, Date.now()) : null);
  } else {
    const scan = getGridEntry(String(formData.get('from') ?? ''));
    if (!scan) redirect(PATH);
    const timing = parseTiming(formData, scan.target);
    createGridSchedule({
      ...timing,
      keyword: scan.keyword,
      target: scan.target,
      center: scan.center,
      grid_size: scan.grid_size,
      spacing_km: scan.spacing_km,
      language: scan.language,
    }, computeNextRun(timing, Date.now()));
  }
  revalidatePath(PATH);
  redirect(PATH);
}

export async function toggleScheduleAction(formData: FormData) {
  const s = getGridSchedule(parseInt(String(formData.get('schedule_id') ?? ''), 10));
  if (s) setGridScheduleEnabled(s.id, !s.enabled, s.enabled ? null : computeNextRun(s, Date.now()));
  revalidatePath(PATH);
}

export async function deleteScheduleAction(formData: FormData) {
  const id = parseInt(String(formData.get('schedule_id') ?? ''), 10);
  if (id) deleteGridSchedule(id);
  revalidatePath(PATH);
  redirect(PATH);
}
