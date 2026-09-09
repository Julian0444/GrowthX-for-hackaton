-- 001 — Primer run durable con tenant (ticket 08).
--
-- Mínimo relacional del recorrido persistido: tenants/pertenencias, sesiones,
-- perfiles versionados, runs/steps/logs e idempotencia. Los payloads admitidos
-- son JSONB validado en la aplicación (contratos del ticket 07); identidades y
-- referencias críticas (tenant, perfil, run, versión, clave idempotente) son
-- columnas con claves y restricciones.
--
-- La aplica lib/server/db/migrate.ts como rol administrador, DESPUÉS de
-- asegurar los roles de aplicación (growthx_app, growthx_worker,
-- growthx_queue): las grants de abajo los referencian.
--
-- RLS: las tablas de negocio fuerzan aislamiento por tenant vía la setting
-- transaccional growthx.tenant_id (set_config(..., true) — se limpia sola al
-- terminar la transacción, antes de devolver la conexión al pool). Las tablas
-- de identidad (tenants, app_users, memberships, sessions) son el camino de
-- autenticación: solo growthx_app puede leerlas; el worker y el rol de cola no.

create schema if not exists growthx;

-- ============ Identidad y pertenencia ============

create table growthx.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table growthx.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table growthx.memberships (
  tenant_id uuid not null references growthx.tenants (id),
  user_id uuid not null references growthx.app_users (id),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Sesión de servidor: el navegador solo guarda un token opaco; acá vive su
-- hash. El tenant de la sesión se fija al crearla en el servidor y se
-- revalida contra memberships en cada resolución — nunca se acepta un
-- tenantId del navegador.
create table growthx.sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references growthx.app_users (id),
  tenant_id uuid not null references growthx.tenants (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, user_id) references growthx.memberships (tenant_id, user_id)
);

-- ============ Negocio: perfiles, runs, steps, logs ============

-- Perfil versionado: lineage_id agrupa versiones del mismo perfil; una
-- reevaluación crea otra versión, no reescribe. payload = EvaluationProfile
-- (contrato 07) validado en escritura Y en lectura.
create table growthx.profiles (
  id uuid primary key,
  tenant_id uuid not null references growthx.tenants (id),
  lineage_id uuid not null,
  version int not null check (version >= 1),
  contract_version text not null,
  payload jsonb not null,
  created_by uuid not null references growthx.app_users (id),
  created_at timestamptz not null default now(),
  unique (tenant_id, lineage_id, version),
  -- Referencia compuesta: impide que un run enlace un perfil de otro tenant.
  unique (tenant_id, id)
);

create table growthx.runs (
  id uuid primary key,
  tenant_id uuid not null references growthx.tenants (id),
  profile_id uuid not null,
  requested_by uuid not null references growthx.app_users (id),
  mode text not null check (mode in ('catalog_research', 'event_evaluation')),
  input jsonb not null,
  state text not null default 'queued'
    check (state in ('queued', 'running', 'completed', 'failed')),
  workflow_version text not null,
  contract_version text not null,
  -- Idempotencia por (tenant, clave): misma clave + mismo payload_hash → el
  -- mismo run; misma clave + otro payload → conflicto (409).
  idempotency_key text not null,
  payload_hash text not null,
  attempt_count int not null default 0,
  error jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, id),
  foreign key (tenant_id, profile_id) references growthx.profiles (tenant_id, id)
);

create table growthx.run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tenant_id uuid not null references growthx.tenants (id),
  seq int not null check (seq >= 1),
  name text not null,
  state text not null default 'pending'
    check (state in ('pending', 'running', 'completed', 'failed')),
  attempts int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error jsonb,
  output jsonb,
  unique (run_id, seq),
  foreign key (tenant_id, run_id) references growthx.runs (tenant_id, id)
);

-- Log estructurado por run/step/intento. Nunca guarda credenciales ni
-- páginas completas; mensajes cortos + contexto JSONB acotado.
create table growthx.run_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references growthx.tenants (id),
  run_id uuid not null,
  step_name text,
  attempt int,
  level text not null check (level in ('info', 'warn', 'error')),
  message text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, run_id) references growthx.runs (tenant_id, id)
);

create index run_logs_by_run on growthx.run_logs (run_id, id);
create index run_steps_by_run on growthx.run_steps (run_id, seq);

-- ============ RLS por tenant ============

-- nullif(...) evita el error de cast con setting vacía: sin contexto de tenant
-- la comparación es NULL y ninguna fila es visible (ni siquiera para leer).
-- FORCE también somete a un eventual propietario de la tabla.

alter table growthx.profiles enable row level security;
alter table growthx.profiles force row level security;
create policy tenant_isolation_profiles on growthx.profiles
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.runs enable row level security;
alter table growthx.runs force row level security;
create policy tenant_isolation_runs on growthx.runs
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.run_steps enable row level security;
alter table growthx.run_steps force row level security;
create policy tenant_isolation_run_steps on growthx.run_steps
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.run_logs enable row level security;
alter table growthx.run_logs force row level security;
create policy tenant_isolation_run_logs on growthx.run_logs
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

-- ============ Grants (roles de aplicación, sin propietario ni bypass) ============

grant usage on schema growthx to growthx_app, growthx_worker;

-- Camino de autenticación: SOLO growthx_app. El worker no resuelve sesiones y
-- el rol de cola no toca datos de negocio.
grant select on growthx.tenants, growthx.app_users, growthx.memberships,
  growthx.sessions to growthx_app;

-- Negocio: app y worker, siempre bajo RLS. Sin DELETE: el recorrido es
-- append/update, no borra evaluaciones.
grant select, insert, update on growthx.profiles, growthx.runs,
  growthx.run_steps, growthx.run_logs to growthx_app, growthx_worker;
grant usage on all sequences in schema growthx to growthx_app, growthx_worker;
