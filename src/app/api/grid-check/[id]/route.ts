import { NextRequest, NextResponse } from 'next/server';
import { collectGridResults } from '@/app/dashboard/local-finder/grid-scan';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await collectGridResults(id);
  if (result.status === 'error') {
    // Same response shapes the pending view has always read: 404/401 carry only `error`.
    const body = result.httpStatus === 400 ? { status: 'error', error: result.error } : { error: result.error };
    return NextResponse.json(body, { status: result.httpStatus });
  }
  return NextResponse.json(result);
}
