import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Throwaway DB, same pattern as db.test.ts (getDb() reads DB_PATH lazily on first call).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-sched-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import {
  createGridSchedule, getGridSchedule, getDueGridSchedules, claimGridScheduleRun, setGridScheduleRunResult,
  syncRunningGridSchedules, failInterruptedGridSchedules, setGridScheduleEnabled, saveGridSearchPending,
  updateGridProgress, getGridHistory, getGridSearchesBySchedule, type GridScheduleInput,
} from './db';

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const input: GridScheduleInput = {
  label: 'Joe\'s Plumbing', keyword: 'plumber', target: 'joes plumbing', center: '47.6,-122.3',
  grid_size: 3, spacing_km: 1, language: 'English', queue_mode: 'standard', depth: 10,
  frequency: 'daily', day_of_week: null, day_of_month: null, time_of_day: '08:00',
};

describe('grid schedules', () => {
  it('lets exactly one caller claim a due run', () => {
    const id = createGridSchedule(input, 1_000);
    expect(getDueGridSchedules(2_000).map((s) => s.id)).toContain(id);

    expect(claimGridScheduleRun(id, 1_000, 90_000, 2_000)).toBe(true);
    // A second scheduler (or tick) that read the same next_run_at loses.
    expect(claimGridScheduleRun(id, 1_000, 90_000, 2_000)).toBe(false);

    const s = getGridSchedule(id)!;
    expect(s.next_run_at).toBe(90_000);
    expect(s.last_status).toBe('starting');
    expect(getDueGridSchedules(2_000).map((x) => x.id)).not.toContain(id);
  });

  it('never claims a paused schedule', () => {
    const id = createGridSchedule(input, 1_000);
    setGridScheduleEnabled(id, false, null);
    expect(getDueGridSchedules(2_000).map((s) => s.id)).not.toContain(id);
    expect(claimGridScheduleRun(id, 1_000, 90_000, 2_000)).toBe(false);
  });

  it('marks a run interrupted by a restart as failed', () => {
    const id = createGridSchedule(input, 1_000);
    claimGridScheduleRun(id, 1_000, 90_000, 2_000);
    failInterruptedGridSchedules();
    const s = getGridSchedule(id)!;
    expect(s.last_status).toBe('failed');
    expect(s.last_error).toMatch(/restart/);
  });

  it('turns a running schedule into success once its queued scan completes, and links the scan', () => {
    const id = createGridSchedule(input, 1_000);
    claimGridScheduleRun(id, 1_000, 90_000, 2_000);
    saveGridSearchPending({
      id: 'auto-scan-1', ts: 2_000, keyword: 'plumber', target: 'joes plumbing', center: '47.6,-122.3',
      grid_size: 3, spacing_km: 1, language: 'English', status: 'pending', queue_mode: 'standard', depth: 10,
      schedule_id: id,
    }, [{ task_id: 't1', row: 0, col: 0, lat: 1, lng: 1 }]);
    setGridScheduleRunResult(id, 'running', 'auto-scan-1', null);

    syncRunningGridSchedules();
    expect(getGridSchedule(id)!.last_status).toBe('running');

    updateGridProgress('auto-scan-1', [{ row: 0, col: 0, lat: 1, lng: 1, rank: 2, items: [
      { rank_group: 1, title: 'Rival Co', is_target: false }, { rank_group: 2, title: 'Joes Plumbing', is_target: true },
    ] }], []);
    syncRunningGridSchedules();
    const s = getGridSchedule(id)!;
    expect(s.last_status).toBe('success');
    expect(s.last_scan_id).toBe('auto-scan-1');

    expect(getGridHistory().find((e) => e.id === 'auto-scan-1')?.schedule_id).toBe(id);
    expect(getGridSearchesBySchedule(id).map((e) => e.id)).toEqual(['auto-scan-1']);
  });

  it('reports a finished scan with no listings anywhere as failed, not success', () => {
    const id = createGridSchedule(input, 1_000);
    claimGridScheduleRun(id, 1_000, 90_000, 2_000);
    saveGridSearchPending({
      id: 'auto-scan-empty', ts: 2_000, keyword: 'plumber', target: 'joes plumbing', center: '47.6,-122.3',
      grid_size: 3, spacing_km: 1, language: 'English', status: 'pending', queue_mode: 'standard', depth: 10,
      schedule_id: id,
    }, [{ task_id: 't2', row: 0, col: 0, lat: 1, lng: 1 }]);
    setGridScheduleRunResult(id, 'running', 'auto-scan-empty', null);
    updateGridProgress('auto-scan-empty', [{ row: 0, col: 0, lat: 1, lng: 1, rank: null, items: [] }], []);
    syncRunningGridSchedules();
    const s = getGridSchedule(id)!;
    expect(s.last_status).toBe('failed');
    expect(s.last_error).toMatch(/no results/);
  });
});
