-- DP-08: durable tenant/source-version cache; no shared service migration implied.
create table growthx.location_lookups (
  tenant_id uuid not null,
  cache_key text not null,
  run_id uuid not null,
  state text not null check(state in ('started','completed')),
  output jsonb,
  created_at timestamptz not null default now(),
  primary key(tenant_id,cache_key),
  foreign key(tenant_id,run_id) references growthx.runs(tenant_id,id)
);
alter table growthx.location_lookups enable row level security;
alter table growthx.location_lookups force row level security;
create policy tenant_location_lookups on growthx.location_lookups
  using(tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid)
  with check(tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid);
grant select on growthx.location_lookups to growthx_app;
grant select,insert,update on growthx.location_lookups to growthx_worker;

-- Free provider, bounded use: 30 starts/day across the installation, 3/run,
-- at least 1 second between starts. A crash keeps its reservation.
create table growthx.location_allowance (
  singleton boolean primary key default true check(singleton),
  day date not null default (now() at time zone 'UTC')::date,
  starts integer not null default 0,
  last_start timestamptz
);
insert into growthx.location_allowance(singleton) values(true);
create function growthx.reserve_location_lookup(target_run uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,growthx as $$
declare allowed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('dp08-location-allowance',0));
  if not exists(select 1 from growthx.runs where id=target_run and tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid) then raise exception 'Location run unavailable'; end if;
  if (select count(*) from growthx.location_lookups where run_id=target_run and tenant_id=nullif(current_setting('growthx.tenant_id',true),'')::uuid)>=3 then return false; end if;
  update growthx.location_allowance set day=(now() at time zone 'UTC')::date, starts=0 where day<>(now() at time zone 'UTC')::date;
  update growthx.location_allowance set starts=starts+1,last_start=clock_timestamp()
    where singleton and starts<30 and (last_start is null or last_start<=clock_timestamp()-interval '1 second') returning true into allowed;
  return coalesce(allowed,false);
end $$;
revoke all on function growthx.reserve_location_lookup(uuid) from public;
grant execute on function growthx.reserve_location_lookup(uuid) to growthx_worker;
