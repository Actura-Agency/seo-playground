'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  APIProvider, Map, AdvancedMarker, InfoWindow, useMap, useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import type { GridPoint } from '@/lib/db';
import { competitorKey } from './grid-insights';

interface Props {
  points: GridPoint[];
  gridSize: number;
  target: string;
  /** When set, markers show this competitor's rank at each point instead of the target's. */
  highlightKey?: string;
  highlightName?: string;
}

function rankColor(rank: number | null): string {
  if (rank === null) return '#94a3b8';
  if (rank === 1) return '#1A6600';
  if (rank === 2) return '#59810A';
  if (rank === 3) return '#969C15';
  if (rank === 4) return '#CBB21D';
  if (rank === 5) return '#FFC826';
  if (rank === 6) return '#EF9E1E';
  if (rank === 7) return '#DD7015';
  if (rank === 8) return '#CC430D';
  return '#BA1604';
}

function rankTextColor(rank: number): string {
  if (rank <= 3)  return '#059669';
  if (rank <= 10) return '#2563eb';
  if (rank <= 20) return '#d97706';
  return '#dc2626';
}

function buildPopupHtml(point: GridPoint, target: string, highlightKey?: string): string {
  const items = point.items ?? [];

  const itemRows = items.slice(0, 20).map((item) => {
    const isHighlighted = !item.is_target && !!highlightKey && competitorKey(item) === highlightKey;
    const nameStyle = item.is_target
      ? 'font-weight:700;color:#059669'
      : isHighlighted
        ? 'font-weight:700;color:#2563eb'
        : 'font-weight:400;color:#334155';
    const rankColor_ = rankTextColor(item.rank_group);
    const stars = item.rating_value != null
      ? `<span style="color:#f59e0b;font-size:10px">★</span><span style="font-size:10px;color:#64748b"> ${item.rating_value.toFixed(1)}${item.rating_votes != null ? ` (${item.rating_votes.toLocaleString()})` : ''}</span>`
      : '';
    const rowBg = item.is_target
      ? 'background:#f0fdf4;border-left:3px solid #10b981;padding-left:5px;margin-left:-5px;border-radius:2px;'
      : isHighlighted
        ? 'background:#eff6ff;border-left:3px solid #3b82f6;padding-left:5px;margin-left:-5px;border-radius:2px;'
        : '';
    const mapsHref = item.cid
      ? `https://www.google.com/maps?cid=${item.cid}`
      : `https://www.google.com/maps/search/${encodeURIComponent(item.title)}`;
    const mapsLink = `<a href="${mapsHref}" target="_blank" rel="noopener noreferrer" style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;color:#3b82f6;text-decoration:none;white-space:nowrap;margin-top:2px;display:inline-block">Maps ↗</a>`;
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f9;${rowBg}">
        <span style="font-size:12px;font-weight:900;min-width:24px;color:${rankColor_}">#${item.rank_group}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;${nameStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${item.title}</div>
          ${item.domain ? `<div style="font-size:10px;color:#94a3b8;margin-top:1px">${item.domain}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${stars ? `<div style="margin-top:1px">${stars}</div>` : ''}
            ${mapsLink}
          </div>
        </div>
      </div>`;
  }).join('');

  const emptyMsg = items.length === 0
    ? '<p style="color:#94a3b8;font-size:12px;margin:8px 0">No results at this point.</p>'
    : '';

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:230px;max-width:260px;max-height:260px;overflow-y:auto">
      <p style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin:0 0 6px">
        Target: <span style="color:#334155">${target}</span>
      </p>
      ${itemRows}${emptyMsg}
    </div>`;
}

/** Resolves the rank to display at a point, given whether a competitor is being highlighted. */
function pointRank(point: GridPoint, highlightKey?: string): number | null {
  if (!highlightKey) return point.rank;
  const match = (point.items ?? []).find((i) => !i.is_target && competitorKey(i) === highlightKey);
  return match ? match.rank_group : null;
}

/** Fits the viewport to every grid point once, on mount — mirrors the old L.map.fitBounds() call. */
function FitBoundsOnLoad({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

interface GridMarkerProps {
  point: GridPoint;
  isCenter: boolean;
  cellPx: number;
  fontSize: number;
  target: string;
  highlightKey?: string;
}

/** One grid-point marker: the colored circle plus its click-to-open local-pack InfoWindow. */
function GridMarker({ point, isCenter, cellPx, fontSize, target, highlightKey }: GridMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const rank = pointRank(point, highlightKey);
  const color = rankColor(rank);
  const label = rank != null ? String(rank) : '—';
  const border = isCenter ? '3px dashed rgba(255,255,255,0.85)' : '2px solid rgba(255,255,255,0.4)';

  // Rank #1 gets a star instead of a circle so it stands out at a glance from #2/#3. Drawn as an
  // SVG path (not a CSS clip-path) with a matching-color rounded stroke, so the points come out
  // bulky and rounded rather than sharp.
  const isFirst = rank === 1;
  const size = isFirst ? Math.round(cellPx * 1.17) : cellPx;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: point.lat!, lng: point.lng! }}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Outer layer only becomes a visible halo for a #1-ranked center point, replacing the
            dashed border a circle would otherwise use to mark "this is the grid center". */}
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'relative',
            width: isFirst && isCenter ? size + 10 : size,
            height: isFirst && isCenter ? size + 10 : size,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.1s',
            transform: hovered ? 'scale(1.12)' : 'scale(1)',
          }}
        >
          {isFirst && isCenter && (
            <svg width={size + 10} height={size + 10} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
              <path
                d="M12,2 L15.2,7.6 L21.5,8.9 L17.2,13.7 L17.9,20.1 L12,17.5 L6.1,20.1 L6.8,13.7 L2.5,8.9 L8.8,7.6 Z"
                fill="rgba(255,255,255,0.9)" stroke="rgba(255,255,255,0.9)" strokeWidth={3.5} strokeLinejoin="round"
              />
            </svg>
          )}
          <div
            style={{
              position: 'relative',
              width: size, height: size,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize, fontWeight: 900, color: 'white',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {isFirst ? (
              <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}>
                <path
                  d="M12,2 L15.2,7.6 L21.5,8.9 L17.2,13.7 L17.9,20.1 L12,17.5 L6.1,20.1 L6.8,13.7 L2.5,8.9 L8.8,7.6 Z"
                  fill={color} stroke={color} strokeWidth={3.5} strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  background: color,
                  borderRadius: '50%',
                  border,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                }}
              />
            )}
            <span style={{ position: 'relative' }}>{label}</span>
          </div>
        </div>
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} maxWidth={280} onCloseClick={() => setOpen(false)}>
          <div dangerouslySetInnerHTML={{ __html: buildPopupHtml(point, target, highlightKey) }} />
        </InfoWindow>
      )}
    </>
  );
}

export default function GridMap({ points, gridSize, target, highlightKey, highlightName }: Props) {
  const half = Math.floor(gridSize / 2);
  const geoPoints = useMemo(() => points.filter((p) => p.lat != null && p.lng != null), [points]);
  const cellPx = gridSize <= 3 ? 52 : gridSize <= 5 ? 44 : gridSize <= 7 ? 38 : 32;
  const fontSize = gridSize <= 5 ? 15 : 13;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const boundsPoints = useMemo(
    () => geoPoints.map((p) => ({ lat: p.lat!, lng: p.lng! })),
    [geoPoints],
  );

  if (geoPoints.length === 0 || !apiKey) {
    return (
      <div
        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center"
        style={{ height: 520 }}
      >
        <p className="text-sm text-slate-400">
          {apiKey ? 'No results with coordinates.' : 'Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {highlightKey && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg">
          Showing: {highlightName ?? 'competitor'}
        </div>
      )}
      <div
        className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800"
        style={{ height: 520 }}
      >
        <APIProvider apiKey={apiKey}>
          <Map
            mapId="f66d288b089a743094f4de9b"
            defaultCenter={{ lat: geoPoints[0].lat!, lng: geoPoints[0].lng! }}
            defaultZoom={13}
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl={false}
            rotateControl={false}
            style={{ width: '100%', height: '100%' }}
          >
            <FitBoundsOnLoad points={boundsPoints} />
            {geoPoints.map((point) => (
              <GridMarker
                key={`${point.row}-${point.col}`}
                point={point}
                isCenter={point.row === half && point.col === half}
                cellPx={cellPx}
                fontSize={fontSize}
                target={target}
                highlightKey={highlightKey}
              />
            ))}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
