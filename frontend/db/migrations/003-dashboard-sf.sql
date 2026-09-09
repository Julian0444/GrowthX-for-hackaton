-- 10: guardar investigación, aun sin edición elegible. No es una decisión de inversión.
create table growthx.organizer_research (
  tenant_id uuid not null references growthx.tenants(id),
  run_id uuid not null,
  organizer_id text not null,
  saved_by uuid not null references growthx.app_users(id),
  state text not null default 'pending_research' check (state = 'pending_research'),
  saved_at timestamptz not null default now(),
  primary key (tenant_id, run_id, organizer_id),
  foreign key (tenant_id, run_id) references growthx.runs(tenant_id,id),
  foreign key (tenant_id, organizer_id) references growthx.organizers(tenant_id,id)
);
alter table growthx.organizer_research enable row level security;
alter table growthx.organizer_research force row level security;
create policy tenant_isolation_organizer_research on growthx.organizer_research
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);
grant select, insert on growthx.organizer_research to growthx_app;
