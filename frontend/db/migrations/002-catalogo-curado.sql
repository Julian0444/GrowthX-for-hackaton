-- 002 — Catálogo curado de SF: eventos, fuentes, claims y revisiones (ticket 09).
--
-- Materializa el catálogo BAJO EL TENANT (sin catálogo global compartido): cada
-- tabla lleva tenant_id con RLS forzada y las referencias críticas son claves
-- compuestas (tenant_id, id), así un claim no puede enlazar una fuente ni un
-- evento de otro tenant. Los payloads son JSONB validado contra los contratos
-- del ticket 07 en escritura Y en lectura; identidades, cadena de revisiones y
-- relaciones quedan en columnas con restricciones.
--
-- Modelo de revisiones (patrón uniforme del contrato 07):
-- - La identidad (organizador, edición, participación, claim) es estable; toda
--   corrección es una REVISIÓN nueva encadenada por previous_revision_id. Nada
--   se actualiza ni borra: una edición no puede borrar la evidencia anterior.
-- - `unique nulls not distinct (tenant, entidad, previous_revision_id)` fuerza
--   cadena lineal: una sola revisión inicial y un solo sucesor por revisión.
-- - Fuentes y empresas son registros inmutables (el contrato no les define
--   revisiones): recargar el mismo id con otro contenido es un conflicto.
--
-- Procedencia: cada carga interna explícita (scripts/load-curated-catalog.ts)
-- queda registrada en catalog_loads con responsable, fecha de verificación y
-- etiqueta del material ('synthetic' mientras la DECISIÓN ABIERTA D4 no cierre
-- el catálogo real). Las filas insertadas apuntan a su carga vía load_id.

-- ============ Cargas del manifiesto (carga interna explícita) ============

create table growthx.catalog_loads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references growthx.tenants (id),
  manifest_name text not null,
  -- sha256 del manifiesto canónico: recargar el MISMO manifiesto es un no-op
  -- declarado (idempotencia de la carga completa).
  manifest_hash text not null,
  -- 'synthetic' = fixture etiquetado (no acredita eventos reales, D4);
  -- 'curated' = material revisado del catálogo real (requiere cerrar D4).
  material text not null check (material in ('synthetic', 'curated')),
  authorized_by text not null,
  verified_at timestamptz not null,
  note text,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, manifest_hash),
  unique (tenant_id, id)
);

-- ============ Fuentes (inmutables) ============

create table growthx.sources (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  contract_version text not null,
  url text,
  provider text not null,
  fetched_at timestamptz not null,
  geo_scope text not null,
  payload jsonb not null,
  load_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, load_id) references growthx.catalog_loads (tenant_id, id)
);

-- ============ Empresas (registro inmutable, contrato CompanyRecord) ============

create table growthx.companies (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  name text not null,
  payload jsonb not null,
  load_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, load_id) references growthx.catalog_loads (tenant_id, id)
);

-- ============ Organizadores ============
-- Identidad separada de sus revisiones: dos homónimos son dos filas con ids
-- distintos y NUNCA se fusionan por similitud de nombre.

create table growthx.organizers (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table growthx.organizer_revisions (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  organizer_id text not null,
  previous_revision_id text,
  revised_at timestamptz not null,
  contract_version text not null,
  payload jsonb not null,
  load_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, organizer_id) references growthx.organizers (tenant_id, id),
  foreign key (tenant_id, previous_revision_id) references growthx.organizer_revisions (tenant_id, id),
  foreign key (tenant_id, load_id) references growthx.catalog_loads (tenant_id, id),
  unique nulls not distinct (tenant_id, organizer_id, previous_revision_id)
);
create index organizer_revisions_by_organizer
  on growthx.organizer_revisions (tenant_id, organizer_id);

-- ============ Ediciones de evento ============

create table growthx.event_editions (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table growthx.edition_revisions (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  edition_id text not null,
  previous_revision_id text,
  revised_at timestamptz not null,
  contract_version text not null,
  payload jsonb not null,
  load_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, edition_id) references growthx.event_editions (tenant_id, id),
  foreign key (tenant_id, previous_revision_id) references growthx.edition_revisions (tenant_id, id),
  foreign key (tenant_id, load_id) references growthx.catalog_loads (tenant_id, id),
  unique nulls not distinct (tenant_id, edition_id, previous_revision_id)
);
create index edition_revisions_by_edition
  on growthx.edition_revisions (tenant_id, edition_id);

-- ============ Participaciones (empresa ↔ edición, con rol documentado) ============
-- La relación es una identidad propia con revisiones; empresa y edición van en
-- columnas con clave compuesta para que el recorrido empresa → edición → fuente
-- quede siempre dentro del tenant.

create table growthx.participations (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table growthx.participation_revisions (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  participation_id text not null,
  company_id text not null,
  edition_id text not null,
  previous_revision_id text,
  revised_at timestamptz not null,
  contract_version text not null,
  payload jsonb not null,
  load_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, participation_id) references growthx.participations (tenant_id, id),
  foreign key (tenant_id, company_id) references growthx.companies (tenant_id, id),
  foreign key (tenant_id, edition_id) references growthx.event_editions (tenant_id, id),
  foreign key (tenant_id, previous_revision_id) references growthx.participation_revisions (tenant_id, id),
  foreign key (tenant_id, load_id) references growthx.catalog_loads (tenant_id, id),
  unique nulls not distinct (tenant_id, participation_id, previous_revision_id)
);
create index participation_revisions_by_edition
  on growthx.participation_revisions (tenant_id, edition_id);
create index participation_revisions_by_company
  on growthx.participation_revisions (tenant_id, company_id);

-- ============ Claims y sus revisiones ============

create table growthx.claims (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table growthx.claim_revisions (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,
  claim_id text not null,
  subject_type text not null
    check (subject_type in ('organizer', 'edition', 'company', 'participation')),
  subject_id text not null,
  attribute text not null,
  status text not null
    check (status in ('announced', 'reported', 'observed', 'inferred', 'confirmed', 'pending', 'contradicted')),
  previous_revision_id text,
  reviewed_at timestamptz not null,
  contract_version text not null,
  payload jsonb not null,
  load_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, claim_id) references growthx.claims (tenant_id, id),
  foreign key (tenant_id, previous_revision_id) references growthx.claim_revisions (tenant_id, id),
  foreign key (tenant_id, load_id) references growthx.catalog_loads (tenant_id, id),
  unique nulls not distinct (tenant_id, claim_id, previous_revision_id)
);
create index claim_revisions_by_subject
  on growthx.claim_revisions (tenant_id, subject_type, subject_id);

-- Referencia fuente→claim materializada con clave compuesta: una revisión de
-- claim no puede citar una fuente de otro tenant (la FK exige el mismo
-- tenant_id y la RLS fija ese tenant al contexto de la transacción).
create table growthx.claim_revision_sources (
  tenant_id uuid not null references growthx.tenants (id),
  claim_revision_id text not null,
  source_id text not null,
  primary key (tenant_id, claim_revision_id, source_id),
  foreign key (tenant_id, claim_revision_id) references growthx.claim_revisions (tenant_id, id),
  foreign key (tenant_id, source_id) references growthx.sources (tenant_id, id)
);

-- ============ RLS por tenant (mismo patrón que 001) ============

alter table growthx.catalog_loads enable row level security;
alter table growthx.catalog_loads force row level security;
create policy tenant_isolation_catalog_loads on growthx.catalog_loads
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.sources enable row level security;
alter table growthx.sources force row level security;
create policy tenant_isolation_sources on growthx.sources
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.companies enable row level security;
alter table growthx.companies force row level security;
create policy tenant_isolation_companies on growthx.companies
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.organizers enable row level security;
alter table growthx.organizers force row level security;
create policy tenant_isolation_organizers on growthx.organizers
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.organizer_revisions enable row level security;
alter table growthx.organizer_revisions force row level security;
create policy tenant_isolation_organizer_revisions on growthx.organizer_revisions
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.event_editions enable row level security;
alter table growthx.event_editions force row level security;
create policy tenant_isolation_event_editions on growthx.event_editions
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.edition_revisions enable row level security;
alter table growthx.edition_revisions force row level security;
create policy tenant_isolation_edition_revisions on growthx.edition_revisions
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.participations enable row level security;
alter table growthx.participations force row level security;
create policy tenant_isolation_participations on growthx.participations
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.participation_revisions enable row level security;
alter table growthx.participation_revisions force row level security;
create policy tenant_isolation_participation_revisions on growthx.participation_revisions
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.claims enable row level security;
alter table growthx.claims force row level security;
create policy tenant_isolation_claims on growthx.claims
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.claim_revisions enable row level security;
alter table growthx.claim_revisions force row level security;
create policy tenant_isolation_claim_revisions on growthx.claim_revisions
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.claim_revision_sources enable row level security;
alter table growthx.claim_revision_sources force row level security;
create policy tenant_isolation_claim_revision_sources on growthx.claim_revision_sources
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

-- ============ Grants (mínimos: catálogo append-only) ============

-- growthx_app escribe (carga interna vía script + lecturas de rutas). Sin
-- UPDATE ni DELETE: las correcciones son revisiones nuevas; la única excepción
-- es catalog_loads.summary, que la carga completa al cerrar su transacción.
grant select, insert on growthx.sources, growthx.companies, growthx.organizers,
  growthx.organizer_revisions, growthx.event_editions, growthx.edition_revisions,
  growthx.participations, growthx.participation_revisions, growthx.claims,
  growthx.claim_revisions, growthx.claim_revision_sources to growthx_app;
grant select, insert, update (summary) on growthx.catalog_loads to growthx_app;

-- El worker SOLO lee el catálogo (research_catalog); no cura material.
grant select on growthx.catalog_loads, growthx.sources, growthx.companies,
  growthx.organizers, growthx.organizer_revisions, growthx.event_editions,
  growthx.edition_revisions, growthx.participations,
  growthx.participation_revisions, growthx.claims, growthx.claim_revisions,
  growthx.claim_revision_sources to growthx_worker;
