import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { hashSessionToken } from '../../lib/server/auth/session.ts';

export const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function eventually<T>(get:()=>Promise<T|null>,message:string,timeout=60000):Promise<T> {
  const until=Date.now()+timeout;
  while(Date.now()<until) { const value=await get(); if(value!==null)return value; await new Promise(r=>setTimeout(r,100)); }
  throw Error(`Timeout: ${message}`);
}
export function startProcess(args:string[],cwd=FRONTEND,env:Record<string,string>={}) {
  const child=spawn(process.execPath,args,{cwd,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',GROWTHX_WORKER_POLL_SECONDS:'0.5',...env},stdio:['ignore','pipe','pipe']});
  let log=''; child.stdout?.on('data',b=>log=(log+String(b)).slice(-15000));child.stderr?.on('data',b=>log=(log+String(b)).slice(-15000));
  return {child,log:()=>log};
}
export async function stopProcess(child:ChildProcess) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  await new Promise<void>(resolve=> {const timer=setTimeout(()=>child.kill('SIGKILL'),12000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
}
export async function startTestApp() {
  const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));
  const productionDir=process.env.DP04_PRODUCTION_DIR;
  const temp=productionDir??mkdtempSync(path.join(tmpdir(),'growthx-dp04-e2e-'));
  if(!productionDir){cpSync(FRONTEND,temp,{recursive:true,filter:file=>!['node_modules','.next','.env.local','.env','tests','.git'].includes(path.basename(file))});symlinkSync(path.join(FRONTEND,'node_modules'),path.join(temp,'node_modules'),'dir');}
  const next=startProcess([path.join(temp,'node_modules/next/dist/bin/next'),...(productionDir?['start']:['dev','--webpack']),'--hostname','127.0.0.1','--port',String(port)],temp);
  const base=`http://127.0.0.1:${port}`;
  try {await eventually(async()=>{if(next.child.exitCode!==null)throw Error(next.log());try{return (await fetch(base)).ok?true:null;}catch{return null;}},'Next ready');}
  catch(error){await stopProcess(next.child);if(!productionDir)rmSync(temp,{recursive:true,force:true});throw error;}
  return {base,log:next.log,close:async()=>{await stopProcess(next.child);if(!productionDir)rmSync(temp,{recursive:true,force:true});}};
}
export async function seedSession(admin:pg.Client) {
  const tenantId=randomUUID(),userId=randomUUID(),token=randomBytes(24).toString('hex');
  await admin.query('insert into growthx.tenants(id,slug,display_name) values($1::uuid,$1::text,$1::text)',[tenantId]);
  await admin.query('insert into growthx.app_users(id,email,display_name) values($1::uuid,$1::text,$1::text)',[userId]);
  await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$2)',[tenantId,userId]);
  await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '1 hour')",[hashSessionToken(token),userId,tenantId]);
  return {tenantId,userId,token};
}
