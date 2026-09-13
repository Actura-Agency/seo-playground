import type { GridPoint, GridLocalItem } from '@/lib/db';

export interface GridSummary {
  totalPoints: number;
  foundCount: number;
  avgRank: number | null;
  top3Count: number;
  top10Count: number;
  /** Weighted visibility score (0-100): 21 minus rank (capped at 21, "not found" scores 0), averaged across the grid. */
  ato: number;
  /** % of grid points where the target has a numeric rank 1-20. Found/not-found only — says nothing about position. */
  coverage: number;
  /** Average Rank Position: mean target rank across found points only. Null (never 0) if the target was never found. */
  arp: number | null;
  /** Share of Local Voice: % of ALL grid points (found + not-found) where the target ranks in the top 3. */
  solv: number;
}

/** Same stats shown in the results view (ATO score, avg rank, top 3/10 counts, Coverage/ARP/SoLV) — shared so history previews stay consistent. */
export function computeGridSummary(results: GridPoint[]): GridSummary {
  const totalPoints = results.length;
  const ranked = results.filter((p) => p.rank !== null);
  const top3Count = results.filter((p) => p.rank !== null && p.rank <= 3).length;
  const top10Count = results.filter((p) => p.rank !== null && p.rank <= 10).length;
  const avgRank = ranked.length > 0
    ? Math.round((ranked.reduce((s, p) => s + p.rank!, 0) / ranked.length) * 10) / 10
    : null;
  const ato = totalPoints > 0
    ? Math.round((results.reduce((s, p) => s + (21 - Math.min(p.rank ?? 21, 21)), 0) / (totalPoints * 20)) * 100)
    : 0;

  // Coverage/ARP count a "found" point as rank 1-20 (DataForSEO's local-pack depth is always 20,
  // so every non-null rank already satisfies this — the bound is kept explicit for correctness).
  const foundInRange = results.filter((p) => p.rank !== null && p.rank! >= 1 && p.rank! <= 20);
  const coverage = totalPoints > 0 ? (foundInRange.length / totalPoints) * 100 : 0;
  const arp = foundInRange.length > 0
    ? Math.round((foundInRange.reduce((s, p) => s + p.rank!, 0) / foundInRange.length) * 100) / 100
    : null;
  // SoLV's denominator is every grid point (found + not-found), unlike ARP's found-only denominator.
  const solv = totalPoints > 0 ? (top3Count / totalPoints) * 100 : 0;

  // foundCount matches Coverage's numerator (bounded 1-20) so the "Found on X of Y" caption
  // under the Coverage card always agrees with the Coverage percentage shown above it.
  return { totalPoints, foundCount: foundInRange.length, avgRank, top3Count, top10Count, ato, coverage, arp, solv };
}

/**
 * Groups a competitor listing by the most reliable identity available: place_id (not currently
 * returned by the Local Finder API, kept for forward compatibility), then cid (Google's local
 * business id), then normalized name as a last resort.
 */
export function competitorKey(item: GridLocalItem): string {
  if (item.place_id) return `place:${item.place_id}`;
  if (item.cid) return `cid:${item.cid}`;
  return `name:${item.title.trim().toLowerCase()}`;
}

export interface CompetitorSummary {
  key: string;
  name: string;
  domain?: string;
  cid?: string;
  appearances: number;
  totalPoints: number;
  avgRank: number;
  bestRank: number;
  top3Count: number;
  avgRating: number | null;
  /** Same weighted-visibility formula as the target's ATO score, so the two are directly comparable. */
  visibilityScore: number;
  /** Same Coverage/ARP/SoLV definitions as the target's primary metrics, so competitors are directly comparable. */
  coverage: number;
  arp: number | null;
  solv: number;
}

/** Ranks every non-target business seen across the grid by how often and how highly it shows up. */
export function computeCompetitors(results: GridPoint[]): CompetitorSummary[] {
  const totalPoints = results.length;
  const byKey = new Map<string, {
    name: string; domain?: string; cid?: string; ranks: number[]; ratings: number[];
  }>();

  for (const point of results) {
    // A single grid point can contain duplicate result objects for the same business (a known
    // DataForSEO Local Finder data-quality quirk) — dedupe per point so one business can only
    // ever contribute one appearance per grid point, keeping appearances <= totalPoints.
    const seenAtThisPoint = new Set<string>();
    for (const item of point.items ?? []) {
      if (item.is_target) continue;
      const key = competitorKey(item);
      if (!key || seenAtThisPoint.has(key)) continue;
      seenAtThisPoint.add(key);
      let entry = byKey.get(key);
      if (!entry) {
        entry = { name: item.title, domain: item.domain, cid: item.cid, ranks: [], ratings: [] };
        byKey.set(key, entry);
      }
      entry.ranks.push(item.rank_group);
      if (item.rating_value != null) entry.ratings.push(item.rating_value);
      if (!entry.cid && item.cid) entry.cid = item.cid;
    }
  }

  return Array.from(byKey.entries())
    .map(([key, e]) => {
      // Same 1-20 bound as the target's Coverage/ARP/SoLV, applied here for direct comparability.
      const inRange = e.ranks.filter((r) => r >= 1 && r <= 20);
      const top3Count = e.ranks.filter((r) => r <= 3).length;
      return {
        key,
        name: e.name,
        domain: e.domain,
        cid: e.cid,
        appearances: e.ranks.length,
        totalPoints,
        avgRank: Math.round((e.ranks.reduce((s, r) => s + r, 0) / e.ranks.length) * 10) / 10,
        bestRank: Math.min(...e.ranks),
        top3Count,
        avgRating: e.ratings.length
          ? Math.round((e.ratings.reduce((s, r) => s + r, 0) / e.ratings.length) * 10) / 10
          : null,
        visibilityScore: totalPoints > 0
          ? Math.round((e.ranks.reduce((s, r) => s + (21 - Math.min(r, 21)), 0) / (totalPoints * 20)) * 100)
          : 0,
        coverage: totalPoints > 0 ? (inRange.length / totalPoints) * 100 : 0,
        arp: inRange.length > 0
          ? Math.round((inRange.reduce((s, r) => s + r, 0) / inRange.length) * 100) / 100
          : null,
        solv: totalPoints > 0 ? (top3Count / totalPoints) * 100 : 0,
      };
    })
    .sort((a, b) => b.appearances - a.appearances || a.avgRank - b.avgRank);
}

export interface RingStat {
  ring: number;
  distanceKm: number;
  pointCount: number;
  foundCount: number;
  avgRank: number | null;
  top3Pct: number;
}

/** Buckets grid points into concentric rings around the center and summarizes rank per ring — reveals how far the target's visibility actually reaches. */
export function computeRingStats(results: GridPoint[], gridSize: number, spacingKm: number): RingStat[] {
  const half = Math.floor(gridSize / 2);
  const byRing = new Map<number, GridPoint[]>();

  for (const p of results) {
    const ring = Math.max(Math.abs(p.row - half), Math.abs(p.col - half));
    if (!byRing.has(ring)) byRing.set(ring, []);
    byRing.get(ring)!.push(p);
  }

  return Array.from(byRing.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ring, pts]) => {
      const found = pts.filter((p) => p.rank !== null);
      return {
        ring,
        distanceKm: Math.round(ring * spacingKm * 10) / 10,
        pointCount: pts.length,
        foundCount: found.length,
        avgRank: found.length > 0
          ? Math.round((found.reduce((s, p) => s + p.rank!, 0) / found.length) * 10) / 10
          : null,
        top3Pct: pts.length > 0
          ? Math.round((pts.filter((p) => p.rank !== null && p.rank! <= 3).length / pts.length) * 100)
          : 0,
      };
    });
}
