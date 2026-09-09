-- 004 — Importación durable de eventos Luma (ticket 11).
--
-- El step de obtención del worker persiste el resultado de una URL de Luma
-- aportada por el usuario en el MISMO modelo de eventos/claims del ticket 09
-- (no hay un segundo formato de importación). Para eso:
--
-- 1. La etiqueta de material admite 'imported': material extraído
--    automáticamente de una página de evento aportada por el usuario. No es
--    'synthetic' (fixture) ni 'curated' (revisión humana, D4): mentir la
--    etiqueta ocultaría que nadie revisó el material.
-- 2. growthx_worker recibe INSERT sobre las tablas que la importación escribe.
--    El diseño de 09 («el worker solo lee el catálogo») sigue valiendo para la
--    curación: el worker NO escribe empresas, organizadores ni participaciones
--    — la importación no crea identidades de organizador ni roles comerciales;
--    lo que la página anuncia queda como claims de la edición.

alter table growthx.catalog_loads drop constraint catalog_loads_material_check;
alter table growthx.catalog_loads
  add constraint catalog_loads_material_check
  check (material in ('synthetic', 'curated', 'imported'));

-- La importación registra su procedencia como una carga más (catalog_loads) y
-- escribe fuente + edición + claims bajo RLS del tenant del run.
grant insert on growthx.sources, growthx.event_editions, growthx.edition_revisions,
  growthx.claims, growthx.claim_revisions, growthx.claim_revision_sources
  to growthx_worker;
grant insert, update (summary) on growthx.catalog_loads to growthx_worker;
