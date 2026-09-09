-- 006 — Decisión condicional persistida y su campaña en borrador (ticket 13).
--
-- Las decisiones son APPEND-ONLY: cada fila es UNA revisión inmutable de la
-- decisión (identidad estable decision_id, cadena por previous_revision_id).
-- PATCH agrega una revisión nueva conservando las anteriores; UPDATE/DELETE no
-- existen como operación ni como grant — no «arreglar» un permission denied
-- con grants. Dos pestañas que revisan a la vez no se sobrescriben: la unique
-- (tenant_id, decision_id, revision) hace que una gane y la otra reciba
-- conflicto (revisión esperada obsoleta).
--
-- Una decisión referencia un snapshot oficial EXISTENTE del tenant (arista
-- 12 → 13, FK compuesta) y una alternativa de ese snapshot. El borrador de
-- campaña se confirma EN LA MISMA TRANSACCIÓN que la revisión de decisión que
-- lo produce (criterio 6): una caída no deja una decisión elegida apuntando a
-- una campaña inexistente, y descartar/pendiente no crea ninguna campaña.
--
-- El payload es el contrato 07 (EvaluationDecision / CampaignDraftRecord)
-- validado en escritura y revalidado en lectura. Autor y tenant salen de la
-- sesión del servidor: acá solo se persisten ya resueltos.

create table growthx.decisions (
  tenant_id uuid not null references growthx.tenants (id),
  id uuid not null,               -- id de ESTA revisión (payload.id)
  decision_id uuid not null,      -- identidad estable a través de revisiones
  snapshot_id uuid not null,
  edition_id text not null,       -- alternativa decidida (del snapshot)
  revision int not null check (revision >= 1),
  previous_revision_id uuid,
  verdict text not null check (verdict in ('chosen', 'discarded', 'pending')),
  decided_by uuid not null references growthx.app_users (id),
  decided_at timestamptz not null,
  contract_version text not null,
  -- Idempotencia de la operación que creó esta revisión (POST o PATCH):
  -- misma clave + mismo payload_hash → la misma revisión; otro payload → 409.
  idempotency_key text,
  payload_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  -- Carrera entre pestañas: la revisión N se inserta una sola vez.
  unique (tenant_id, decision_id, revision),
  -- Cadena lineal: cada revisión tiene a lo sumo una sucesora (y una sola
  -- primera revisión por identidad, via nulls not distinct).
  unique nulls not distinct (tenant_id, decision_id, previous_revision_id),
  foreign key (tenant_id, snapshot_id) references growthx.snapshots (tenant_id, id),
  foreign key (tenant_id, edition_id) references growthx.event_editions (tenant_id, id),
  foreign key (tenant_id, previous_revision_id) references growthx.decisions (tenant_id, id)
);

-- Una sola decisión (identidad) por alternativa de un snapshot: repetir el
-- POST no crea una segunda decisión; se revisa la existente (PATCH).
create unique index decisions_one_per_alternative
  on growthx.decisions (tenant_id, snapshot_id, edition_id)
  where revision = 1;

create unique index decisions_idempotency
  on growthx.decisions (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index decisions_by_identity on growthx.decisions (tenant_id, decision_id);
create index decisions_by_snapshot on growthx.decisions (tenant_id, snapshot_id);

-- Borrador de campaña: a lo sumo UNO por revisión de decisión, insertado en la
-- transacción de esa revisión. Solo una revisión con verdict = 'chosen' lo
-- lleva; las filas de revisiones anteriores quedan como historia (append-only).
create table growthx.campaign_drafts (
  tenant_id uuid not null references growthx.tenants (id),
  id text not null,                    -- id estable del borrador (payload.id, p.ej. camp-…)
  decision_id uuid not null,           -- identidad de la decisión de origen
  decision_revision_id uuid not null,  -- revisión que confirmó ESTE borrador
  contract_version text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, decision_revision_id),
  foreign key (tenant_id, decision_revision_id) references growthx.decisions (tenant_id, id)
);

create index campaign_drafts_by_decision on growthx.campaign_drafts (tenant_id, decision_id);

alter table growthx.decisions enable row level security;
alter table growthx.decisions force row level security;
create policy tenant_isolation_decisions on growthx.decisions
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.campaign_drafts enable row level security;
alter table growthx.campaign_drafts force row level security;
create policy tenant_isolation_campaign_drafts on growthx.campaign_drafts
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

-- Grants mínimos: la decisión es una operación humana por HTTP (rol app).
-- El worker NO decide ni lee decisiones; nadie tiene update/delete.
grant select, insert on growthx.decisions, growthx.campaign_drafts to growthx_app;
