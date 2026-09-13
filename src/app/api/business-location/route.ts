import { NextRequest, NextResponse } from 'next/server';
import { getCredentials } from '@/lib/db';

interface MyBusinessInfoResponse {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{
      items?: Array<{
        latitude?: number;
        longitude?: number;
      }>;
    }>;
  }>;
}

/**
 * Looks up a business's real address coordinates by cid, for the "view competitor's actual
 * location" marker on the geo-grid map. This is a separate, on-demand DataForSEO call — never
 * part of the grid scan itself, since Local Finder results don't include lat/lng or address.
 */
export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get('cid');
  const center = req.nextUrl.searchParams.get('center');
  const language = req.nextUrl.searchParams.get('language');

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
    res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: `cid:${cid}`,
        // CID already pins the exact listing; a wide radius just satisfies the API's required
        // location parameter without narrowing/affecting which business is returned.
        location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},50000`,
        language_name: language,
      }]),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.name : 'fetch failed' }, { status: 502 });
  }

  if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });

  const data = await res.json() as MyBusinessInfoResponse;
  const task = data?.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    return NextResponse.json({ error: task?.status_message ?? 'no task in response' }, { status: 502 });
  }

  const item = task.result?.[0]?.items?.[0];
  if (item?.latitude == null || item?.longitude == null) {
    return NextResponse.json({ error: 'Business location not found.' }, { status: 404 });
  }

  return NextResponse.json({ lat: item.latitude, lng: item.longitude });
}
