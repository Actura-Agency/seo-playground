/** Share of points that must be in before a still-running scan shows its map. */
export const EARLY_SHOW_SHARE = 0.98;

/**
 * True when a still-running scan is close enough to finished to show what it has: 98% of points
 * in, or only one left (so small grids, where 98% means every point, skip the wait for the last
 * slow point too). A finished scan (ready === total) is not "early".
 */
export function canShowEarly(ready: number, total: number): boolean {
  if (total <= 0 || ready <= 0 || ready >= total) return false;
  return ready >= total - 1 || ready >= Math.ceil(total * EARLY_SHOW_SHARE);
}
