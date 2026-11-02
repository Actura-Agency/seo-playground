'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  searchId: string;
  ready: number;
  totalPoints: number;
}

const POLL_INTERVAL = 10_000;

/**
 * Banner over a scan that is shown before its last point or two arrive (see canShowEarly). Keeps
 * checking in the background and reloads the page's data when another point lands or the scan
 * finishes, so the map fills in on its own.
 */
export default function GridFinishing({ searchId, ready, totalPoints }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const checkingRef = useRef(false);
  // Set once a refresh is requested; cleared when the page sends a new `ready` count.
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshingRef.current = false;
    const check = async () => {
      if (checkingRef.current || refreshingRef.current) return;
      checkingRef.current = true;
      try {
        const res = await fetch(`/api/grid-check/${searchId}`);
        const data = await res.json() as { status?: string; ready?: number; error?: string };
        // Same messages the progress card shows (e.g. missing credentials), so a stuck scan isn't hidden.
        setError(!res.ok || data.error ? data.error ?? 'Could not check for the last points.' : null);
        if (data.status === 'done' || (data.ready ?? 0) > ready) {
          refreshingRef.current = true;
          router.refresh();
        }
      } catch {
        setError('Network error — will retry.');
      } finally {
        checkingRef.current = false;
      }
    };
    const first = setTimeout(check, 0);
    const timer = setInterval(check, POLL_INTERVAL);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [searchId, ready, router]);

  const left = totalPoints - ready;
  return (
    <div className="mb-3 flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
      <div className="w-2 h-2 mt-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
          Final results still coming in ({left} {left === 1 ? 'point' : 'points'} left)
        </p>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
          Here&apos;s what we have so far: {ready} of {totalPoints} points. Stats below count only these. The
          gray dashed {left === 1 ? 'dot is' : 'dots are'} still loading, and this page fills in on its own.
        </p>
        {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}
