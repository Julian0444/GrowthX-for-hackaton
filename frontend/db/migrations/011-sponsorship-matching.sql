-- 011 — Primera vertical funcional de matching sponsor ↔ organizador.
--
-- Las oportunidades y solicitudes de introduccion son APPEND-ONLY. Una
-- publicacion describe lo que el organizador ofrece en ese momento; cambiarla
-- se modelara como una nueva revision en una iteracion posterior, no con un
-- UPDATE silencioso. La solicitud congela la lectura explicable y el plan de
-- medicion vistos por el sponsor al pedir la introduccion.
--
-- En este primer corte el marketplace vive dentro del tenant. Compartir una
-- oportunidad entre organizaciones requiere una politica de publicacion y
-- consentimiento explicita; RLS no se relaja implicitamente para simularlo.

create table growthx.sponsorship_opportunities (
  tenant_id uuid not null references growthx.tenants (id),
  id uuid not null,
  created_by uuid not null references growthx.app_users (id),
  status text not null check (status = 'open'),
  contract_version text not null check (contract_version = '1'),
  idempotency_key text not null,
  payload_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key)
);

create index sponsorship_opportunities_by_created_at
  on growthx.sponsorship_opportunities (tenant_id, created_at desc, id);

create table growthx.sponsorship_interest_requests (
  tenant_id uuid not null references growthx.tenants (id),
  id uuid not null,
  opportunity_id uuid not null,
  sponsor_run_id uuid not null,
  requested_by uuid not null references growthx.app_users (id),
  status text not null check (status = 'requested'),
  contract_version text not null check (contract_version = '1'),
  idempotency_key text not null,
  payload_hash text not null,
  payload jsonb not null,
  requested_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, opportunity_id, sponsor_run_id),
  foreign key (tenant_id, opportunity_id)
    references growthx.sponsorship_opportunities (tenant_id, id),
  foreign key (tenant_id, sponsor_run_id)
    references growthx.runs (tenant_id, id)
);

create index sponsorship_interests_by_opportunity
  on growthx.sponsorship_interest_requests (tenant_id, opportunity_id, requested_at desc);

alter table growthx.sponsorship_opportunities enable row level security;
alter table growthx.sponsorship_opportunities force row level security;
create policy tenant_isolation_sponsorship_opportunities
  on growthx.sponsorship_opportunities
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

alter table growthx.sponsorship_interest_requests enable row level security;
alter table growthx.sponsorship_interest_requests force row level security;
create policy tenant_isolation_sponsorship_interest_requests
  on growthx.sponsorship_interest_requests
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);

-- No UPDATE/DELETE: ambas tablas son registro auditable de actos humanos.
-- El worker y el modelo no publican oportunidades ni piden introducciones.
grant select, insert on growthx.sponsorship_opportunities,
  growthx.sponsorship_interest_requests to growthx_app;
