// Lecturas y guardados del dashboard, siempre dentro de una transacción con RLS.
import type pg from 'pg';
import { getAppPool, withTenantTransaction } from '../db/pool.ts';
import { parseCompanyRecord, parseEvaluationProfile } from '../../contracts/evaluation-validation.ts';
import type { EvaluationProfile } from '../../contracts/evaluation.ts';
import type {
  ResearchHome,
  SavedEvaluation,
  SavedEvaluationDecision,
  SavedEvaluationProfile,
  SavedOrganizerResearch,
  SfResearchResult,
} from '../../../components/research-dashboard/research-types.ts';

// Filtro explícito de la lista de evaluaciones (ticket 14): por identidad del
// perfil (revisión exacta). No hay filtro por texto de producto: dos perfiles
// con el mismo producto y distinto presupuesto/objetivo no se mezclan.
export interface ResearchHomeFilter {
  profileId?: string | null;
}

function profileSummary(row: { profile_id: string; lineage_id: string; version: number; profile: unknown }): SavedEvaluationProfile {
  const parsed = parseEvaluationProfile(row.profile);
  if (!parsed.ok) throw new Error('Perfil persistido inválido');
  const profile: EvaluationProfile = parsed.value;
  return {
    profileId: row.profile_id,
    lineageId: row.lineage_id,
    version: Number(row.version),
    product: profile.product,
    budget: profile.budget,
    objective: profile.objective.kind,
    window: profile.window,
  };
}

// Evaluaciones guardadas del tenant: runs de comparación con su snapshot
// oficial (si el worker ya lo confirmó), los nombres de las ediciones
// comparadas y la ÚLTIMA revisión de cada decisión registrada contra ese
// snapshot (con su fecha original y el borrador confirmado con ella). Todo
// bajo RLS; no consulta fuentes ni recalcula nada.
export async function readSavedEvaluations(client: pg.ClientBase, profileId: string | null): Promise<SavedEvaluation[]> {
  const { rows } = await client.query(
    `select r.id, r.state, r.created_at, r.updated_at, r.error, r.input,
            p.id as profile_id, p.lineage_id, p.version, p.payload as profile,
            s.id as snapshot_id, s.evaluated_at
       from growthx.runs r
       join growthx.profiles p on p.id = r.profile_id
       left join growthx.snapshots s on s.run_id = r.id
      where r.mode = 'investment_comparison' and ($1::uuid is null or p.id = $1::uuid)
      order by r.created_at desc, r.id`,
    [profileId],
  );
  if (rows.length === 0) return [];
  const editionIds = [...new Set(rows.flatMap((row) => (Array.isArray(row.input?.editionIds) ? (row.input.editionIds as string[]) : [])))];
  const names = new Map<string, string>();
  if (editionIds.length > 0) {
    const { rows: editionRows } = await client.query(
      `select distinct on (edition_id) edition_id, payload->>'name' as name
         from growthx.edition_revisions where edition_id = any($1::text[])
        order by edition_id, revised_at desc, id desc`,
      [editionIds],
    );
    for (const row of editionRows) names.set(row.edition_id as string, row.name as string);
  }
  const snapshotIds = rows.flatMap((row) => (row.snapshot_id ? [row.snapshot_id as string] : []));
  const decisionsBySnapshot = new Map<string, SavedEvaluationDecision[]>();
  if (snapshotIds.length > 0) {
    const { rows: decisionRows } = await client.query(
      `select d.decision_id, d.snapshot_id, d.edition_id, d.verdict, d.revision, d.decided_at,
              (select count(*)::int from jsonb_array_elements(d.payload->'conditions') c where c->>'status' = 'open') as open_conditions,
              cd.id as campaign_id
         from growthx.decisions d
         left join growthx.campaign_drafts cd on cd.tenant_id = d.tenant_id and cd.decision_revision_id = d.id
        where d.snapshot_id = any($1::uuid[])
          and d.revision = (select max(d2.revision) from growthx.decisions d2 where d2.decision_id = d.decision_id)
        order by d.snapshot_id, d.edition_id`,
      [snapshotIds],
    );
    for (const row of decisionRows) {
      const list = decisionsBySnapshot.get(row.snapshot_id as string) ?? [];
      list.push({
        decisionId: row.decision_id,
        editionId: row.edition_id,
        verdict: row.verdict,
        revision: Number(row.revision),
        decidedAt: row.decided_at.toISOString(),
        openConditions: Number(row.open_conditions),
        campaignId: row.campaign_id ?? null,
      });
      decisionsBySnapshot.set(row.snapshot_id as string, list);
    }
  }
  return rows.map((row) => ({
    runId: row.id,
    state: row.state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    error: row.error?.message ?? null,
    previousRunId: typeof row.input?.previousRunId === 'string' ? row.input.previousRunId : null,
    profile: profileSummary(row),
    editions: (Array.isArray(row.input?.editionIds) ? (row.input.editionIds as string[]) : []).map((editionId) => ({ editionId, name: names.get(editionId) ?? null })),
    snapshotId: row.snapshot_id ?? null,
    evaluatedAt: row.evaluated_at ? row.evaluated_at.toISOString() : null,
    decisions: row.snapshot_id ? (decisionsBySnapshot.get(row.snapshot_id as string) ?? []) : [],
  }));
}

async function readEvaluationProfiles(client: pg.ClientBase): Promise<SavedEvaluationProfile[]> {
  const { rows } = await client.query(
    `select p.id as profile_id, p.lineage_id, p.version, p.payload as profile
       from growthx.profiles p
      where exists (select 1 from growthx.runs r where r.profile_id = p.id and r.mode = 'investment_comparison')
      order by p.created_at desc, p.id`,
  );
  return rows.map(profileSummary);
}

export async function readSavedOrganizers(client: pg.ClientBase, runId?: string): Promise<SavedOrganizerResearch[]> {
  const { rows } = await client.query(`select run_id, organizer_id, state, saved_at from growthx.organizer_research ${runId ? 'where run_id = $1' : ''} order by saved_at desc`, runId ? [runId] : []);
  return rows.map(row => ({ runId: row.run_id, organizerId: row.organizer_id, state: row.state, savedAt: row.saved_at.toISOString() }));
}
export async function readResearchHome(tenantId: string, filter: ResearchHomeFilter = {}): Promise<ResearchHome> {
  const profileId = filter.profileId ?? null;
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
      evaluations: await readSavedEvaluations(client, profileId),
      evaluationProfiles: await readEvaluationProfiles(client),
      evaluationFilter: profileId ? { profileId } : null,
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
