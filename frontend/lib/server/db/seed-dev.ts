// Seed de DESARROLLO: tenant + usuario + pertenencia + sesión para probar el
// recorrido persistido en local (ticket 08). Corre como administrador:
//   pnpm db:seed-dev
//
// Imprime el token de sesión (solo por stdout, jamás persistido en el repo) y
// cómo usarlo. Material local de desarrollo; la identidad real de la demo
// compartida es la decisión abierta D3.

import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashSessionToken, SESSION_COOKIE } from '../auth/session.ts';

const TENANT_SLUG = 'growthx-dev';
const USER_EMAIL = 'dev@growthx.local';

async function main(): Promise<void> {
  const url = process.env.GROWTHX_ADMIN_DATABASE_URL;
  if (!url) {
    throw new Error('Falta GROWTHX_ADMIN_DATABASE_URL. Ver frontend/db/README.md.');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows: tenantRows } = await client.query(
      `insert into growthx.tenants (slug, display_name) values ($1, 'GrowthX (dev)')
       on conflict (slug) do update set display_name = excluded.display_name
       returning id`,
      [TENANT_SLUG],
    );
    const tenantId = tenantRows[0].id as string;
    const { rows: userRows } = await client.query(
      `insert into growthx.app_users (email, display_name) values ($1, 'Dev local')
       on conflict (email) do update set display_name = excluded.display_name
       returning id`,
      [USER_EMAIL],
    );
    const userId = userRows[0].id as string;
    await client.query(
      `insert into growthx.memberships (tenant_id, user_id, role) values ($1, $2, 'member')
       on conflict do nothing`,
      [tenantId, userId],
    );
    const token = randomBytes(32).toString('hex');
    await client.query(
      `insert into growthx.sessions (token_hash, user_id, tenant_id, expires_at)
       values ($1, $2, $3, now() + interval '30 days')`,
      [hashSessionToken(token), userId, tenantId],
    );
    console.log(`Tenant ${TENANT_SLUG} (${tenantId}) · usuario ${USER_EMAIL} (${userId})`);
    console.log('');
    console.log('Token de sesión (válido 30 días, no se guarda en el repo):');
    console.log(`  ${token}`);
    console.log('');
    console.log('Para el navegador (dev): en la consola de devtools de localhost:3000 →');
    console.log(`  document.cookie = "${SESSION_COOKIE}=${token}; path=/"`);
    console.log('Para curl:');
    console.log(`  curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/evaluations/<runId>`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
