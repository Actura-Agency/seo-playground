// DataForSEO Local Finder price per grid point, by results requested (depth 10 or 20). Measured
// against the live API on 2026-10-21 — they revise this periodically, and each finished scan
// shows its real billed cost, so re-check these if the two ever drift apart.
// Shared by the scan form and the automation schedule form.
export type QueueMode = 'live' | 'priority' | 'standard';
export type Depth = 10 | 20;

export const QUEUE_MODES: { value: QueueMode; label: string; cost: Record<Depth, number>; wait: string }[] = [
  // Live is a flat price at either depth, so the app always asks it for the full 20.
  { value: 'live', label: 'Live', cost: { 10: 0.002, 20: 0.002 }, wait: 'Blocks the page' },
  { value: 'priority', label: 'Priority', cost: { 10: 0.0012, 20: 0.0024 }, wait: '~1 min avg, background' },
  { value: 'standard', label: 'Standard', cost: { 10: 0.0006, 20: 0.0012 }, wait: '5–45 min, background' },
];
