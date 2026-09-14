-- DP-04: durable attempts reference the SAME tenant's run and source store.
create table growthx.discovery_runs (
  tenant_id uuid not null,
  run_id uuid not null,
  plan jsonb not null,
  started_at timestamptz,
  deadline_at timestamptz,
  finished_at timestamptz,
  limitations jsonb not null default '[]',
  material text not null default 'real' check (material in ('real','synthetic')),
  primary key (tenant_id, run_id),
  foreign key (tenant_id, run_id) references growthx.runs(tenant_id, id)
);
create table growthx.discovery_operations (
  tenant_id uuid not null,
  run_id uuid not null,
  id text not null,
  seq int not null,
  query jsonb not null,
  state text not null check (state in ('dispatched','succeeded','failed','uncertain')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  limitation text,
  response jsonb,
  consumption jsonb not null,
  remaining_budget numeric not null,
  primary key (tenant_id, id),
  unique (tenant_id, run_id, seq),
  foreign key (tenant_id, run_id) references growthx.discovery_runs(tenant_id, run_id)
);
alter table growthx.discovery_runs enable row level security;
alter table growthx.discovery_runs force row level security;
create policy tenant_isolation_discovery_runs on growthx.discovery_runs
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);
alter table growthx.discovery_operations enable row level security;
alter table growthx.discovery_operations force row level security;
create policy tenant_isolation_discovery_operations on growthx.discovery_operations
  using (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid);
grant select, insert on growthx.discovery_runs to growthx_app;
grant select on growthx.discovery_operations to growthx_app;
grant select, update on growthx.discovery_runs to growthx_worker;
grant select, insert, update on growthx.discovery_operations to growthx_worker;

-- One initiative allowance across all tenants/runs/workers. It is an app
-- allowance, NOT Exa's account balance. Unknown calls keep their reservation.
create table growthx.discovery_allowance (
  provider text primary key check (provider = 'exa'),
  limit_usd numeric not null check (limit_usd between 0 and 10),
  reserved_usd numeric not null default 0 check (reserved_usd >= 0),
  halted boolean not null default false
);
insert into growthx.discovery_allowance(provider, limit_usd) values ('exa', 10);
-- Narrow capability: cannot reset/raise allowance, cannot inspect other runs.
create function growthx.reserve_exa_discovery(target_run uuid) returns numeric
language plpgsql security definer set search_path = pg_catalog, growthx as $$
declare remaining numeric;
begin
  if not exists (select 1 from growthx.discovery_runs where run_id = target_run
    and tenant_id = nullif(current_setting('growthx.tenant_id', true), '')::uuid) then
    raise exception 'Discovery run unavailable';
  end if;
  update growthx.discovery_allowance set reserved_usd = reserved_usd + 0.02
    where provider = 'exa' and not halted and reserved_usd + 0.02 <= limit_usd
    returning limit_usd - reserved_usd into remaining;
  return remaining;
end $$;
create function growthx.halt_exa_discovery() returns void
language sql security definer set search_path = pg_catalog, growthx as $$
  update growthx.discovery_allowance set halted = true where provider = 'exa';
$$;
revoke all on function growthx.reserve_exa_discovery(uuid), growthx.halt_exa_discovery() from public;
grant execute on function growthx.reserve_exa_discovery(uuid), growthx.halt_exa_discovery() to growthx_worker;
