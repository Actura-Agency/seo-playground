// DataForSEO Local Finder price per grid point, by results requested (depth 10 or 20). Measured
// against the live API on 2026-10-21 — they revise this periodically, and each finished scan
// shows its real billed cost, so re-check these if the two ever drift apart.
// Every scan runs on DataForSEO's Standard queue, the cheapest (Live and Priority were removed:
// they cost 2-3x more and weren't faster in practice). Shared by the scan and schedule forms.
export type Depth = 10 | 20;

export const SCAN_COST: Record<Depth, number> = { 10: 0.0006, 20: 0.0012 };
export const SCAN_WAIT = 'Usually 1–2 min';
