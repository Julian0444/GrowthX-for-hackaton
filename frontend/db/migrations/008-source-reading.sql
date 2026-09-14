-- DP-05: no raw pages or secrets. Cache is tenant/material scoped; durable
-- outputs keep original fetchedAt. Each attempt belongs to the same run tenant.
create table growthx.source_reads (
  tenant_id uuid not null,
  run_id uuid not null,
  canonical_url text not null,
  material text not null check (material in ('real','synthetic')),
  state text not null check (state in ('reading','succeeded','failed')),
  output jsonb,
  error text,
  checked_at timestamptz not null default now(),
  primary key (tenant_id, run_id, canonical_url),
  foreign key (tenant_id, run_id) references growthx.runs(tenant_id,id)
);
create index source_reads_cache on growthx.source_reads(tenant_id,canonical_url,material,checked_at desc) where state='succeeded';
alter table growthx.source_reads enable row level security;
alter table growthx.source_reads force row level security;
create policy tenant_source_reads on growthx.source_reads
  using (tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid)
  with check (tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid);
grant select on growthx.source_reads to growthx_app;
grant select,insert,update on growthx.source_reads to growthx_worker;

create table growthx.source_actor_operations (
  tenant_id uuid not null,
  run_id uuid not null,
  canonical_url text not null,
  state text not null check (state in ('reserved','running','succeeded','failed','uncertain')),
  actor_run_id text,
  actor_status text,
  output jsonb,
  consumption jsonb not null,
  limitation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,run_id,canonical_url),
  foreign key(tenant_id,run_id) references growthx.runs(tenant_id,id)
);
alter table growthx.source_actor_operations enable row level security;
alter table growthx.source_actor_operations force row level security;
create policy tenant_source_actor_operations on growthx.source_actor_operations
  using (tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid)
  with check (tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid);
grant select on growthx.source_actor_operations to growthx_app;
grant select,insert,update on growthx.source_actor_operations to growthx_worker;

-- A single initiative allowance, NOT USD 15 per tenant/run/session. Reserve
-- USD 1 before starting each bounded page; unknown charges keep the reserve.
-- Native fetch requires no Exa call and never creates another Exa allowance.
create table growthx.source_provider_allowance (
  provider text primary key check(provider='apify'),
  limit_usd numeric not null check(limit_usd between 0 and 15),
  reserved_usd numeric not null default 0 check(reserved_usd >= 0),
  halted boolean not null default false
);
insert into growthx.source_provider_allowance(provider,limit_usd) values('apify',15);
create function growthx.reserve_source_actor(target_run uuid) returns numeric
language plpgsql security definer set search_path=pg_catalog,growthx as $$
declare remaining numeric;
begin
  if not exists(select 1 from growthx.runs where id=target_run and tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid) then raise exception 'Source run unavailable'; end if;
  if (select count(*) from growthx.source_actor_operations where run_id=target_run and tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid) >= 1 then return null; end if;
  update growthx.source_provider_allowance set reserved_usd=reserved_usd+1 where provider='apify' and not halted and reserved_usd+1<=limit_usd returning limit_usd-reserved_usd into remaining;
  return remaining;
end $$;
create function growthx.halt_source_actor() returns void
language sql security definer set search_path=pg_catalog,growthx as $$
  update growthx.source_provider_allowance set halted=true where provider='apify';
$$;
revoke all on function growthx.reserve_source_actor(uuid),growthx.halt_source_actor() from public;
grant execute on function growthx.reserve_source_actor(uuid),growthx.halt_source_actor() to growthx_worker;
