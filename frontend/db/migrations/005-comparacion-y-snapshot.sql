-- 005 — Comparación de inversión y snapshot oficial (ticket 12).
--
-- El snapshot oficial es INMUTABLE por diseño y por grants: ningún rol de
-- aplicación tiene UPDATE ni DELETE sobre estas tablas. Una reevaluación crea
-- otro run con otro snapshot; corregir un snapshot publicado no existe como
-- operación.
--
-- El payload (columna payload) es el EvaluationSnapshot del contrato 07,
-- validado en escritura Y en lectura. Las columnas companion (features,
-- v0_shadow, available_catalog) guardan lo que el ticket 12 exige persistir y
-- el contrato 07 no modela (contratos cerrados: agregar campos ahí sería un
-- cambio de contrato explícito): features usadas con la razón de cada dato
-- ausente, la comparación en sombra contra la referencia v0 y la distinción
-- catálogo disponible vs conjunto comparado.
--
-- La salida del adaptador de modelo se guarda SEPARADA (snapshot_narratives),
-- ligada al snapshot: puede faltar, fallar o rechazarse sin tocar el snapshot
-- numérico. Como máximo una por snapshot (unique): la reentrega del step de
-- redacción reutiliza el registro existente en vez de duplicarlo.

-- Modo nuevo del run: comparación de inversión sobre ediciones seleccionadas.
alter table growthx.runs drop constraint runs_mode_check;
alter table growthx.runs add constraint runs_mode_check
  check (mode in ('catalog_research', 'event_evaluation', 'investment_comparison'));

create table growthx.snapshots (
  id uuid primary key,
  tenant_id uuid not null references growthx.tenants (id),
  run_id uuid not null,
  kind text not null check (kind in ('organizer_research', 'investment_comparison')),
  profile_id uuid not null,
  profile_version int not null check (profile_version >= 1),
  contract_version text not null,
  evaluated_at timestamptz not null,
  -- EvaluationSnapshot (contrato 07) validado; su narrative queda null: la
  -- redacción llega DESPUÉS de confirmar el snapshot y vive aparte.
  payload jsonb not null,
  feature_set_version text not null,
  features jsonb not null,
  v0_shadow jsonb not null,
  available_catalog jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- Un run publica a lo sumo UN snapshot oficial: la reentrega del step no
  -- duplica snapshots, reutiliza el confirmado.
  unique (tenant_id, run_id),
  foreign key (tenant_id, run_id) references growthx.runs (tenant_id, id),
  foreign key (tenant_id, profile_id) references growthx.profiles (tenant_id, id)
);

create table growthx.snapshot_narratives (
  id uuid primary key,
  tenant_id uuid not null references growthx.tenants (id),
  snapshot_id uuid not null,
  status text not null check (status in ('validated', 'rejected', 'deterministic_only')),
  model text not null,
  prompt_version text not null,
  duration_ms int not null check (duration_ms >= 0),
  -- Uso/costo del proveedor cuando está disponible; null = no reportado.
  usage jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, snapshot_id),
  foreign key (tenant_id, snapshot_id) references growthx.snapshots (tenant_id, id)
);

alter table growthx.snapshots enable row level security;
alter table growthx.snapshots force row level security;
create policy tenant_isolation_snapshots on growthx.snapshots
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.snapshot_narratives enable row level security;
alter table growthx.snapshot_narratives force row level security;
create policy tenant_isolation_snapshot_narratives on growthx.snapshot_narratives
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

-- Grants mínimos e inmutabilidad: el worker escribe (evaluate_candidates y
-- compose_narrative corren en el worker) y ambos roles leen. SIN update ni
-- delete para nadie: no «arreglar» un permission denied con grants.
grant select, insert on growthx.snapshots, growthx.snapshot_narratives to growthx_worker;
grant select on growthx.snapshots, growthx.snapshot_narratives to growthx_app;
