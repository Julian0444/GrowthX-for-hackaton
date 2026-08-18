import { NextResponse } from 'next/server';

import { getSharedSearch } from '@/lib/server/connectors/linq-session-store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const shared = getSharedSearch(id);
  if (!shared) {
    return NextResponse.json(
      { error: 'This Linq result link is missing or expired.' },
      { status: 404 },
    );
  }
  return NextResponse.json({
    response: shared.response,
    focusOpportunityId: shared.focusOpportunityId,
    expiresAt: new Date(shared.expiresAt).toISOString(),
  });
}
