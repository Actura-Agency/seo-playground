import { NextRequest, NextResponse } from 'next/server';
import { getCredentials } from '@/lib/db';

interface MyBusinessInfoResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{
      items?: Array<{
        latitude?: number;
        longitude?: number;
      }>;
    }>;
  }> | null;
}

// Same "task still in queue" codes used by the geo-grid scan poller — standard across
// DataForSEO's task-based products, not specific to any one endpoint.
const STILL_PROCESSING = new Set([40602, 40601]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;

  const creds = getCredentials();
  if (!creds) {
    return NextResponse.json({ error: 'No credentials' }, { status: 401 });
  }
  const auth = btoa(`${creds.login}:${creds.pass}`);

  let res: Response;
  try {
    // Note: no "/advanced" suffix here — unlike the SERP task_get family, this business_data
    // product only has a plain task_get/{id} endpoint. Hitting /advanced/{id} 404s with a
    // top-level status_code (tasks: null), which would look identical to "still processing" if
    // treated the same as a real pending task — verified this the hard way against a real task.
    res = await fetch(
      `https://api.dataforseo.com/v3/business_data/google/my_business_info/task_get/${taskId}`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) },
    );
  } catch {
    return NextResponse.json({ status: 'pending' });
  }

  if (!res.ok) return NextResponse.json({ status: 'pending' });

  const data = await res.json() as MyBusinessInfoResponse;
  const task = data.tasks?.[0];
  if (!task) {
    // No task object at all (e.g. a wrong endpoint path, or a bad/expired task id) is a real
    // error, not "still processing" — conflating the two would poll forever with no way to
    // ever succeed. Confirmed this distinction against a real DataForSEO 40400 response.
    return NextResponse.json({ status: 'error', error: data.status_message ?? 'Task not found.' });
  }
  if (STILL_PROCESSING.has(task.status_code ?? 0)) {
    return NextResponse.json({ status: 'pending' });
  }
  if (task.status_code !== 20000) {
    return NextResponse.json({ status: 'error', error: task.status_message ?? 'Lookup failed.' });
  }

  const item = task.result?.[0]?.items?.[0];
  if (item?.latitude == null || item?.longitude == null) {
    return NextResponse.json({ status: 'error', error: 'Business location not found.' });
  }

  return NextResponse.json({ status: 'done', lat: item.latitude, lng: item.longitude });
}
