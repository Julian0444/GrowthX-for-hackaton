// Boundary with DP-04: deepen one persisted proposal in the SAME tenant/run.
// Search evidence stays immutable. DP-06 chooses the subject of each observed
// attribute; reading a page alone must not create/fuse an edition or company.
import { createHash } from 'node:crypto';
import type { EvidenceReference, SourceRecord } from '../../contracts/evaluation.ts';
import { parseSourceRecord } from '../../contracts/evaluation-validation.ts';
import { withTenantTransaction } from '../db/pool.ts';
import { readDiscovery } from '../discovery/durable.ts';
import { upsertSources } from '../evidence/store.ts';
import { cachedSourceRead, type SourceReadContext } from './cache.ts';
import type { ExtractedAttribute } from './extract.ts';
import { readKnownSource, parseKnownSourceRead, type SourceReadOptions, type KnownSourceRead, SourceReadError } from './reader.ts';

export interface ProposedSourceReading {
  proposedSourceId: string;
  source: SourceRecord;
  reading: KnownSourceRead;
  observations: (ExtractedAttribute & { sourceId: string; evidence: EvidenceReference[] })[];
}

export async function readProposedSource(ctx: SourceReadContext, proposedSourceId: string, options: SourceReadOptions = {}): Promise<ProposedSourceReading> {
  const proposal = await withTenantTransaction(ctx.pool, ctx.tenantId, async client => {
    const discovery = await readDiscovery(client, ctx.runId);
    const source = discovery?.sources.find(s => s.id === proposedSourceId);
    if (!source) throw new SourceReadError('Proposed source is not available in this tenant and discovery run.');
    return source;
  });
  const url = proposal.canonicalUrl ?? proposal.url;
  if (!url) throw new SourceReadError('Proposed source has no readable URL.');
  const reading = await cachedSourceRead(ctx, url,
    () => readKnownSource(url, options), parseKnownSourceRead, options);
  const sourceId = `source-read-${createHash('sha256').update(`${ctx.runId}:${reading.canonicalUrl}`).digest('hex').slice(0,24)}`;
  const parsed = parseSourceRecord({
    contractVersion: '1', id: sourceId, url: reading.finalUrl, requestedUrl: reading.requestedUrl, canonicalUrl: reading.canonicalUrl,
    title: reading.fullContent.title, locator: null, provider: new URL(reading.finalUrl).hostname, collector: 'growthx-worker',
    fetchedAt: reading.fetchedAt, publishedAt: null,
    method: `${reading.isFixture ? 'test_fixture' : reading.reading.strategy}+visible_text+jsonld_extraction+${reading.reading.cache}`,
    geoScope: reading.fullContent.location?.city ? 'city' : 'unknown',
    content: { kind: 'hash', sha256: reading.htmlSha256 }, fragments: reading.fullContent.fragments,
    retrieval: { status: reading.reading.status, freshness: reading.reading.freshness, limitation: reading.reading.limitation },
    usageRestrictions: proposal.usageRestrictions,
  });
  if (!parsed.ok) throw new SourceReadError('Full source reading does not match the shared source contract.');
  await withTenantTransaction(ctx.pool, ctx.tenantId, async client => {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`source-persist:${ctx.tenantId}:${sourceId}`]);
    const load = await client.query(`insert into growthx.catalog_loads(tenant_id,manifest_name,manifest_hash,material,authorized_by,verified_at,note,summary)
      select $1,$2,$3,$4,requested_by::text,$5,$6,$7 from growthx.runs where id=$8
      on conflict(tenant_id,manifest_hash) do update set summary=excluded.summary returning id`,
    [ctx.tenantId, `source-reading:${ctx.runId}`, sourceId, reading.isFixture ? 'synthetic' : 'imported', reading.fetchedAt,
      'Automatic full-page extraction; no human review or entity resolution.',
      JSON.stringify({ proposedSourceId, sourceId, runId:ctx.runId, cache:reading.reading.cache }), ctx.runId]);
    if (!load.rows.length) throw new SourceReadError('Source reading run unavailable under tenant.');
    await upsertSources(client, ctx.tenantId, [parsed.value], load.rows[0].id);
  });
  return { proposedSourceId, source: parsed.value, reading,
    observations: reading.fullContent.attributes.map(a => ({ ...a, sourceId,
      evidence: a.fragmentIds.map(fragmentId => ({ sourceId, fragmentId, locator:null })),
    })),
  };
}
