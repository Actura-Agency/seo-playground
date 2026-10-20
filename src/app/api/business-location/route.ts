import { NextRequest, NextResponse } from 'next/server';
import { getCredentials } from '@/lib/db';

/**
 * Starts an on-demand Priority-queue lookup of a business's real address coordinates by cid, for
 * the "view competitor's actual location" marker on the geo-grid map — a separate, background
 * task never part of the grid scan itself, since Local Finder results don't include lat/lng.
 * Priority (not Live, not Standard): a middle ground — ~1 min turnaround, cheaper than Live but
 * far more responsive than Standard's up-to-45-min queue; the caller polls
 * GET /api/business-location/[taskId] for the result.
 */
export async function POST(req: NextRequest) {
  const { cid, center, language } = await req.json() as { cid?: string; center?: string; language?: string };

  if (!cid || !center || !language) {
    return NextResponse.json({ error: 'Missing cid, center, or language.' }, { status: 400 });
  }

  const creds = getCredentials();
  if (!creds) {
    return NextResponse.json({ error: 'No credentials' }, { status: 401 });
  }

  const [lat, lng] = center.split(',').map(Number);
  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Invalid center coordinate.' }, { status: 400 });
  }

  const auth = btoa(`${creds.login}:${creds.pass}`);

  let res: Response;
  try {
    res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/task_post', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: `cid:${cid}`,
        // CID already pins the exact listing; a wide radius just satisfies the API's required
        // location parameter without narrowing/affecting which business is returned.
        location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},50000`,
        language_name: language,
        priority: 2,
      }]),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.name : 'fetch failed' }, { status: 502 });
  }

  if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });

  const data = await res.json() as { tasks?: Array<{ id?: string; status_code?: number; status_message?: string }> };
  const task = data?.tasks?.[0];
  if (!task?.id) {
    return NextResponse.json({ error: task?.status_message ?? 'no task in response' }, { status: 502 });
  }

  return NextResponse.json({ taskId: task.id });
}
