'use client';

import { useEffect, useMemo, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';

interface Props {
  coordinate: string;
  onChange: (coord: string) => void;
  showGrid?: boolean;
  gridSize?: number;
  spacingKm?: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

function calcGridCoords(
  centerLat: number, centerLng: number, gridSize: number, spacingKm: number,
) {
  const latDeg = spacingKm / 111.32;
  const lngDeg = spacingKm / (111.32 * Math.cos(centerLat * Math.PI / 180));
  const half = Math.floor(gridSize / 2);
  const coords: { row: number; col: number; lat: number; lng: number; isCenter: boolean }[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      coords.push({
        row, col,
        lat: centerLat + (half - row) * latDeg,
        lng: centerLng + (col - half) * lngDeg,
        isCenter: row === half && col === half,
      });
    }
  }
  return coords;
}

/** Keeps the map centered on the picked coordinate and fits/zooms to the grid preview when it's shown. */
function MapController({
  coordinate, gridPoints, onExpand,
}: {
  coordinate: string;
  gridPoints: { lat: number; lng: number }[];
  onExpand: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !coordinate) return;
    const [lat, lng] = coordinate.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) return;
    map.setCenter({ lat, lng });
  }, [map, coordinate]);

  useEffect(() => {
    if (!map || gridPoints.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    gridPoints.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 28);
    onExpand();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, gridPoints]);

  return null;
}

/** Nudges the Maps JS API to redraw after the container's CSS height transition finishes (260 <-> 420). */
function ResizeOnExpand({ expanded }: { expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const t = setTimeout(() => google.maps.event.trigger(map, 'resize'), 220);
    return () => clearTimeout(t);
  }, [map, expanded]);
  return null;
}

export default function MapPicker({ coordinate, onChange, showGrid, gridSize, spacingKm }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState('');

  const mapHeight = expanded ? 420 : 260;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Geographic center of the contiguous US — used only when no coordinate has been chosen or saved.
  const [defaultLat, defaultLng] = coordinate
    ? coordinate.split(',').map(Number)
    : [39.8283, -98.5795];

  const markerPosition = useMemo(() => {
    if (!coordinate) return null;
    const [lat, lng] = coordinate.split(',').map(Number);
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
  }, [coordinate]);

  const gridPreviewPoints = useMemo(() => {
    if (!showGrid || !coordinate || !gridSize || !spacingKm) return [];
    const [centerLat, centerLng] = coordinate.split(',').map(Number);
    if (isNaN(centerLat) || isNaN(centerLng)) return [];
    return calcGridCoords(centerLat, centerLng, gridSize, spacingKm);
  }, [showGrid, coordinate, gridSize, spacingKm]);

  async function handleGeocode() {
    if (!query.trim()) return;
    setGeocoding(true);
    setGeoError('');
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results: NominatimResult[] = await res.json();
      if (!results.length) { setGeoError('Location not found.'); return; }
      const { lat, lon } = results[0];
      onChange(`${parseFloat(lat).toFixed(6)},${parseFloat(lon).toFixed(6)}`);
      setExpanded(true);
    } catch {
      setGeoError('Geocoding failed. Try again.');
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <>
      {/* Geocoding search — div to avoid nested <form> */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGeocode(); } }}
          placeholder="Search a city, address, place…"
          className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleGeocode}
          disabled={geocoding || !query.trim()}
          className="px-4 py-2 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {geocoding ? '…' : 'Find'}
        </button>
      </div>
      {geoError && <p className="text-[11px] text-red-500 -mt-1">{geoError}</p>}

      {/* Map */}
      {apiKey ? (
        <div
          className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all duration-300"
          style={{ height: mapHeight }}
        >
          <APIProvider apiKey={apiKey}>
            <Map
              mapId="f66d288b089a743094f4de9b"
              defaultCenter={{ lat: defaultLat, lng: defaultLng }}
              defaultZoom={12}
              gestureHandling="greedy"
              disableDefaultUI={false}
              streetViewControl={false}
              rotateControl={false}
              style={{ width: '100%', height: '100%' }}
              onClick={(e) => {
                if (!e.detail.latLng) return;
                const { lat, lng } = e.detail.latLng;
                onChange(`${lat.toFixed(6)},${lng.toFixed(6)}`);
                setExpanded(true);
              }}
            >
              <MapController coordinate={coordinate} gridPoints={gridPreviewPoints} onExpand={() => setExpanded(true)} />
              <ResizeOnExpand expanded={expanded} />
              {markerPosition && <AdvancedMarker position={markerPosition} />}
              {gridPreviewPoints.map((p) => (
                <AdvancedMarker key={`${p.row}-${p.col}`} position={{ lat: p.lat, lng: p.lng }}>
                  <div
                    style={{
                      width: p.isCenter ? 18 : 12,
                      height: p.isCenter ? 18 : 12,
                      borderRadius: '50%',
                      background: p.isCenter ? '#3b82f6' : '#94a3b8',
                      border: `1.5px solid ${p.isCenter ? '#1d4ed8' : '#475569'}`,
                      opacity: p.isCenter ? 0.9 : 0.7,
                    }}
                  />
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>
        </div>
      ) : (
        <div
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center transition-all duration-300"
          style={{ height: mapHeight }}
        >
          <p className="text-sm text-slate-400">Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</p>
        </div>
      )}
      {showGrid && coordinate && gridSize && spacingKm && (
        <p className="text-[11px] text-slate-400 -mt-1">
          {gridSize}×{gridSize} grid · {(spacingKm / 1.609344).toFixed(2)} mi spacing · {gridSize ** 2} points
        </p>
      )}
    </>
  );
}
