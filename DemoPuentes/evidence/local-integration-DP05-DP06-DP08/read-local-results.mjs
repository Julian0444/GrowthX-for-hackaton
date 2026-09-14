// Read-only evidence export. No tokens, provider keys, HTTP requests or writes to DB.
import pg from '../../../frontend/node_modules/pg/lib/index.js';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readEditionDossier} from '../../../frontend/lib/server/catalog/read.ts';
import {projectEditionPosition} from '../../../frontend/lib/research/edition-location.ts';

const out = fileURLToPath(new URL('.', import.meta.url));
const admin = new pg.Client({connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL});
const app = new pg.Pool({connectionString: process.env.GROWTHX_DATABASE_URL});
if (new URL(process.env.GROWTHX_ADMIN_DATABASE_URL).port !== '54329') throw Error('Expected authorized local DB');
await admin.connect();
try {
  const before = JSON.parse(readFileSync(out + 'database-before.json', 'utf8'));
  const originalRun = '21279a0a-9fe0-4968-b900-29af59463fe6';
  const tenantId = (await admin.query('select tenant_id from growthx.runs where id=$1', [originalRun])).rows[0].tenant_id;
  const runs = (await admin.query('select id,workflow_version,state,created_at,result from growthx.runs where tenant_id=$1 and created_at>$2 order by created_at', [tenantId,before.checkedAt])).rows;
  const reads = (await admin.query(`select run_id,canonical_url,material,state,error,checked_at,
    output->'reading' reading, output->'fullContent'->'coordinates' published_coordinates,
    output->'fullContent'->'location' extracted_location, output->>'htmlSha256' content_hash
    from growthx.source_reads where tenant_id=$1 order by checked_at`, [tenantId])).rows;
  const lookups = (await admin.query('select run_id,state,output,created_at from growthx.location_lookups where tenant_id=$1 order by created_at',[tenantId])).rows;
  const revisions = (await admin.query(`select id,payload from growthx.edition_revisions where tenant_id=$1
    and created_at>$2 order by created_at`,[tenantId,before.checkedAt])).rows;
  const current = [];
  for (const editionId of new Set(revisions.map(r=>r.payload.editionId))) {
    const dossier = await readEditionDossier(app,tenantId,editionId,new Date().toISOString());
    const revision = dossier.editionRevisions.at(-1);
    const claims = dossier.claims.map(c=>c.revisions.at(-1)).filter(c=>revision.claimRevisionIds.includes(c.id));
    current.push({editionId,editionRevisionId:revision.id,canonicalUrl:revision.canonicalUrl,
      publicLocation:revision.publicLocation,projection:projectEditionPosition(revision,dossier.sources,claims),
      relationships:revision.relationships});
  }
  const report = {at:new Date().toISOString(),base:'http://localhost:3000',material:'real public HTTP via browser -> app -> queue -> worker',
    originalRun,runs,reads,lookups,current,
    providerCounts:{census:lookups.length,exa:(await admin.query('select count(*) n from growthx.discovery_operations')).rows[0].n,
      apify:(await admin.query('select count(*) n from growthx.source_actor_operations')).rows[0].n}};
  writeFileSync(out+'real-local-results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({runs:runs.map(r=>({id:r.id,state:r.state,workflow:r.workflow_version})),reads:reads.length,
    failures:reads.filter(r=>r.state==='failed').map(r=>({url:r.canonical_url,error:r.error})),providerCounts:report.providerCounts},null,2));
} finally {await admin.end();await app.end();}
