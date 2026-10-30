import { describe, it, expect } from 'vitest';
import { classifyTaskGet } from './grid-scan';

const response = (top: number | undefined, task?: number) => ({
  status_code: top,
  tasks: task === undefined ? undefined : [{ status_code: task, result: [] }],
});

describe('classifyTaskGet', () => {
  it('treats a finished task as ready', () => {
    expect(classifyTaskGet(response(20000, 20000))).toBe('ready');
  });

  it('keeps queued / in-progress tasks pending', () => {
    expect(classifyTaskGet(response(20000, 40601))).toBe('pending');
    expect(classifyTaskGet(response(20000, 40602))).toBe('pending');
  });

  it('retries refused checks instead of turning them into "Not found" points', () => {
    // Too many simultaneous requests / rate limit / DataForSEO internal error, at either level.
    expect(classifyTaskGet(response(20000, 40209))).toBe('pending');
    expect(classifyTaskGet(response(20000, 40202))).toBe('pending');
    expect(classifyTaskGet(response(20000, 50000))).toBe('pending');
    expect(classifyTaskGet(response(40209))).toBe('pending');
    expect(classifyTaskGet(response(50000, 20000))).toBe('pending');
  });

  it('keeps a response with no task pending', () => {
    expect(classifyTaskGet(response(20000))).toBe('pending');
    expect(classifyTaskGet(null)).toBe('pending');
  });

  it('still finishes a permanently failed task, so a scan never hangs forever', () => {
    // e.g. 40501 invalid field / 40400 not found: a real task failure, not a refused check.
    expect(classifyTaskGet(response(20000, 40501))).toBe('ready');
    expect(classifyTaskGet(response(20000, 40400))).toBe('ready');
  });

  it('tolerates a response without a top-level status code', () => {
    expect(classifyTaskGet(response(undefined, 20000))).toBe('ready');
  });
});
