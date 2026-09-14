import { NextResponse } from 'next/server';
import { resolveHttpSession } from '../../../../lib/server/auth/http-session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../../lib/server/db/pool.ts';
import { acceptBackground, parseBackgroundRequest } from '../../../../lib/server/relationships/durable.ts';

export async function POST(request: Request) {
  if (!isEvaluationDbConfigured()) return NextResponse.json({message:'Research database unavailable.'},{status:503});
  const auth=await resolveHttpSession(request);if(!auth.ok)return auth.response;
  let raw:unknown;try{raw=await request.json();}catch{return NextResponse.json({message:'JSON body required.'},{status:400});}
  const body=parseBackgroundRequest(raw);
  if(!body)return NextResponse.json({message:'Provide a supported public URL or a discovery source and an existing research profile.'},{status:400});
  try {
    const result=await acceptBackground(getAppPool(),auth.session.tenantId,auth.session.userId,body);
    if(result.status==='accepted'||result.status==='duplicate')return NextResponse.json({runId:result.runId},{status:202});
    return NextResponse.json({message:result.status==='conflict'?'Request key already used.':result.issues.join(' ')},{status:result.status==='conflict'?409:400});
  }catch{return NextResponse.json({message:'Could not enqueue background research. No new work was accepted.'},{status:503});}
}
