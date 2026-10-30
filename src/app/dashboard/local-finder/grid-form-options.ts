// Grid size and spacing choices, shared by the scan form and the automation schedule form.

export const GRID_SIZES = [3, 5, 7, 9, 11, 13];

// 1 mile = 1.609344 km (exact, international mile).
export const KM_PER_MILE = 1.609344;
export const MILE_SPACING_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** Snaps an arbitrary miles value (e.g. converted from an old saved km spacing) to the nearest preset option. */
export function nearestMilePreset(miles: number): number {
  return MILE_SPACING_OPTIONS.reduce((closest, option) =>
    Math.abs(option - miles) < Math.abs(closest - miles) ? option : closest,
  );
}
