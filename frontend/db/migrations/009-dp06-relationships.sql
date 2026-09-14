-- DP-06: append-only identities/revisions in the existing tenant catalog.
-- All these tables already FORCE RLS with the transaction's tenant context.
-- No business grants to growthx_queue; no UPDATE/DELETE of evidence.
grant insert on growthx.companies, growthx.organizers, growthx.organizer_revisions to growthx_worker;
