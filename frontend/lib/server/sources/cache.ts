import type pg from 'pg';
import { canonicalKnownSourceUrl, SourceReadError, type KnownSourceRead, type SourceReadOptions } from './reader.ts';

export interface SourceReadContext { pool: pg.Pool; tenantId: string; runId: string }

// Durable native reading with a bounded five-minute cache. Original fetchedAt
// survives reuse; checkedAt and failure show what happened in this attempt.
export async function cachedSourceRead<T extends KnownSourceRead>(
  ctx: SourceReadContext, url: string, obtain: () => Promise<T>, decode: (v:unknown) => T, options: SourceReadOptions = {},
): Promise<T> {
  const canonical=canonicalKnownSourceUrl(url), material=options.isFixture?'synthetic':'real';
  const client=await ctx.pool.connect();
  const lock=`source-read:${ctx.tenantId}:${canonical}`;
  let locked=false;
  const tx=async <R>(work:()=>Promise<R>):Promise<R> => {
    await client.query('begin');
    try { await client.query("select set_config('growthx.tenant_id',$1,true)",[ctx.tenantId]); const result=await work(); await client.query('commit'); return result; }
    catch(e) { await client.query('rollback'); throw e; }
  };
  try {
    const available=(await client.query("select to_regclass('growthx.source_reads') as table_name")).rows[0].table_name;
    if (!available) {
      // Existing local services are not migrated/restarted by hot reload. A
      // native read can still work; paid fallbacks require durable storage.
      const result=await obtain(); result.reading.cache='unavailable'; result.reading.limitation=[result.reading.limitation,'Durable cache unavailable until migration 008 is applied.'].filter(Boolean).join(' '); result.reading.status='partial'; return result;
    }
    locked=(await client.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked',[lock])).rows[0].locked;
    if (!locked) throw new SourceReadError('This source already has an active read; retry pending.');
    const existing=await tx(async()=> {
      if (!(await client.query('select 1 from growthx.runs where id=$1',[ctx.runId])).rows.length) throw new SourceReadError('Run de lectura no disponible bajo el tenant');
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`source-read-limit:${ctx.tenantId}:${ctx.runId}`]);
      const current=(await client.query('select output from growthx.source_reads where run_id=$1 and canonical_url=$2',[ctx.runId,canonical])).rows[0];
      if (current?.output) return { replay:decode(current.output), prior:null };
      const prior=(await client.query("select output from growthx.source_reads where canonical_url=$1 and material=$2 and state='succeeded' order by checked_at desc limit 1",[canonical,material])).rows[0]?.output;
      const count=Number((await client.query('select count(*) as n from growthx.source_reads where run_id=$1',[ctx.runId])).rows[0].n);
      if (!current && count>=6) throw new SourceReadError('Limit of six known sources per research run reached');
      await client.query("insert into growthx.source_reads(tenant_id,run_id,canonical_url,material,state) values($1,$2,$3,$4,'reading') on conflict do nothing",[ctx.tenantId,ctx.runId,canonical,material]);
      return {replay:null,prior:prior?decode(prior):null};
    });
    if (existing.replay) return existing.replay;
    const now=(options.now?.()??new Date()).toISOString();
    const ttl=Math.min(300_000,Math.max(0,options.cacheTtlMs??(options.fetchImpl?0:300_000)));
    let result:T;
    if (!options.forceRefresh && existing.prior && Date.parse(now)-Date.parse(existing.prior.fetchedAt)>=0 && Date.parse(now)-Date.parse(existing.prior.fetchedAt)<ttl) {
      result=structuredClone(existing.prior); result.reading={...result.reading,checkedAt:now,cache:'hit'};
    } else {
      try { result=await obtain(); }
      catch(error) {
        const message=error instanceof SourceReadError?error.message:'Source reading failed; details omitted.';
        if (!existing.prior) { await tx(()=>client.query("update growthx.source_reads set state='failed',error=$3,checked_at=$4 where run_id=$1 and canonical_url=$2",[ctx.runId,canonical,message,now])); throw error; }
        result=structuredClone(existing.prior);
        result.reading={...result.reading,status:'partial',checkedAt:now,cache:'stale_fallback',freshness:'stale',limitation:'Fresh read failed; previously obtained evidence is retained.',failures:[message]};
      }
    }
    await tx(()=>client.query("update growthx.source_reads set state='succeeded',output=$3,error=$4,checked_at=$5 where run_id=$1 and canonical_url=$2",[ctx.runId,canonical,JSON.stringify(result),result.reading.failures.join(' ')||null,now]));
    return result;
  } finally { if(locked)await client.query('select pg_advisory_unlock(hashtextextended($1,0))',[lock]); client.release(); }
}
