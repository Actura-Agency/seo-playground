/** Link that re-opens the geo-grid form pre-filled with a past scan's settings, ready to run again. */
export function gridRerunUrl(entry: { keyword: string; center: string; grid_size: number; spacing_km: number; target: string; language: string; queue_mode: string; depth: number }, basePath = '/dashboard/geo-grid') {
  const p = new URLSearchParams({
    keyword: entry.keyword,
    location_coordinate: entry.center,
    grid_size: String(entry.grid_size),
    spacing_km: String(entry.spacing_km),
    grid_target: entry.target,
    language: entry.language,
    queue_mode: entry.queue_mode,
    depth: String(entry.depth),
    mode: 'grid',
  });
  return `${basePath}?${p.toString()}`;
}
