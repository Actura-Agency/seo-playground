'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getGridSchedule, createGridSchedule, updateGridSchedule, setGridScheduleEnabled,
  deleteGridSchedule, type GridScheduleInput, type GridScheduleFrequency,
} from '@/lib/db';
import { computeNextRun, parseNewScanSettings } from '../../local-finder/grid-schedule';

const PATH = '/dashboard/geo-grid/automation';

/**
 * Reads and validates the whole schedule form: what to scan (keyword, business, map center, grid)
 * plus when (frequency, day, time) and how (queue mode, depth). Returns null if the scan settings
 * are missing or invalid; timing fields that are malformed fall back to safe defaults.
 */
function parseScheduleForm(formData: FormData): GridScheduleInput | null {
  const scan = parseNewScanSettings((k) => formData.get(k)?.toString());
  if (!scan) return null;
  const frequency = (['daily', 'weekly', 'monthly'] as const).find((f) => f === formData.get('frequency')) ?? 'weekly';
  const time = String(formData.get('time_of_day') ?? '');
  const dow = parseInt(String(formData.get('day_of_week') ?? ''), 10);
  const dom = parseInt(String(formData.get('day_of_month') ?? ''), 10);
  return {
    label: String(formData.get('label') ?? '').trim().slice(0, 100) || scan.target,
    keyword: scan.keyword,
    target: scan.target,
    center: scan.center,
    grid_size: scan.gridSize,
    spacing_km: scan.spacingKm,
    language: scan.language,
    frequency: frequency as GridScheduleFrequency,
    day_of_week: frequency === 'weekly' ? (dow >= 0 && dow <= 6 ? dow : 1) : null,
    day_of_month: frequency === 'monthly' ? (dom >= 1 && dom <= 28 ? dom : 1) : null,
    time_of_day: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '08:00',
    queue_mode: 'standard',
    depth: formData.get('depth') === '10' ? 10 : 20,
  };
}

/** Creates a schedule, or saves changes to one (`schedule_id`). Every setting is editable. */
export async function saveScheduleAction(formData: FormData) {
  const scheduleId = parseInt(String(formData.get('schedule_id') ?? ''), 10);
  const input = parseScheduleForm(formData);
  if (!input) redirect(`${PATH}?error=invalid`);
  if (scheduleId) {
    const existing = getGridSchedule(scheduleId);
    if (!existing) redirect(PATH);
    updateGridSchedule(scheduleId, input, existing.enabled ? computeNextRun(input, Date.now()) : null);
  } else {
    createGridSchedule(input, computeNextRun(input, Date.now()));
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
