// Lecturas y guardados del dashboard, siempre dentro de una transacción con RLS.
import type pg from 'pg';
import { getAppPool, withTenantTransaction } from '../db/pool.ts';
import { parseCompanyRecord } from '../../contracts/evaluation-validation.ts';
import type { ResearchHome, SavedOrganizerResearch, SfResearchResult } from '../../../components/research-dashboard/research-types.ts';

export async function readSavedOrganizers(client: pg.ClientBase, runId?: string): Promise<SavedOrganizerResearch[]> {
  const { rows } = await client.query(`select run_id, organizer_id, state, saved_at from growthx.organizer_research ${runId ? 'where run_id = $1' : ''} order by saved_at desc`, runId ? [runId] : []);
  return rows.map(row => ({ runId: row.run_id, organizerId: row.organizer_id, state: row.state, savedAt: row.saved_at.toISOString() }));
}
export async function readResearchHome(tenantId: string): Promise<ResearchHome> {
  return withTenantTransaction(getAppPool(), tenantId, async client => {
    const runs = await client.query(`select r.id, r.state, r.created_at, p.version, p.payload->>'product' as product
      from growthx.runs r join growthx.profiles p on p.id = r.profile_id
      where r.workflow_version = 'sf-organizers/1' order by r.created_at desc, r.id`);
    const companies = await client.query('select payload from growthx.companies order by id');
    const counts = await client.query(`select (select count(*)::int from growthx.organizers) as organizers, (select count(*)::int from growthx.event_editions) as editions`);
    const loads = await client.query('select verified_at, material from growthx.catalog_loads order by verified_at');
    return {
      runs: runs.rows.map(r => ({ runId: r.id, state: r.state, product: r.product, profileVersion: r.version, createdAt: r.created_at.toISOString() })),
      companies: companies.rows.map(r => { const p = parseCompanyRecord(r.payload); if (!p.ok) throw new Error('Empresa inválida'); return p.value; }),
      saved: await readSavedOrganizers(client),
      coverage: { ...counts.rows[0], verifiedAt: [...new Set(loads.rows.map(r => r.verified_at.toISOString() as string))], material: [...new Set(loads.rows.map(r => String(r.material)))] },
    };
  });
}
export async function saveOrganizerResearch(tenantId: string, userId: string, runId: string, organizerId: string): Promise<SavedOrganizerResearch | null> {
  return withTenantTransaction(getAppPool(), tenantId, async client => {
    const { rows } = await client.query('select result from growthx.runs where id = $1 and state = \'completed\'', [runId]);
    const result = rows[0]?.result as SfResearchResult | undefined;
    if (result?.kind !== 'sf_organizer_research' || !result.candidates.some(c => c.organizerId === organizerId)) return null;
    await client.query(`insert into growthx.organizer_research (tenant_id, run_id, organizer_id, saved_by)
      values ($1,$2,$3,$4) on conflict (tenant_id,run_id,organizer_id) do nothing`, [tenantId,runId,organizerId,userId]);
    return (await readSavedOrganizers(client, runId)).find(s => s.organizerId === organizerId) ?? null;
  });
}
