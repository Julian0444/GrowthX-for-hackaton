# 06: Autorizar OAuth de Quiver MCP (paso humano)

**What to build:** El MCP de Quiver AI queda autorizado y operativo desde el editor: la configuración OAuth ya existe en el repo, pero la autorización interactiva solo puede hacerla una persona. Al terminar, una generación de prueba de punta a punta (crear generación → poll de la tarea → descargar contenido) responde correctamente. Esto es lo único que gatea el ticket 07 (assets); por eso va como ticket propio de ~5 minutos.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] OAuth de Quiver autorizado en el editor (Cursor y/o Claude Code) — el MCP responde sin errores de auth desde Cursor
- [x] Una generación de prueba completa el ciclo crear → poll → contenido descargado
- [x] Créditos semanales gratis confirmados como suficientes (~8–12 generaciones previstas) — mejor aún: el modelo default cuesta 0 créditos (ver Answer)

Detalle: sección **M5 / Pipeline** de la spec.

## Answer

Verificado e2e el 2026-08-25 desde Cursor (namespace MCP `plugin-quiverai-quiverai`, estado `ready`):

- **Modelos** (`list_models`): **Arrow 2.0** (`arrow-2`) es el default, acceso `ok` y costo **0 créditos** por generación/vectorización/animación con el plan actual. Arrow 1.1 disponible (20 créditos/generación); Arrow 1.1 Max bloqueado (requiere plan Basic/Pro/Enterprise). Las ~8–12 generaciones previstas están cubiertas de sobra usando `arrow-2`.
- **Ciclo completo**: `create_generation` (arrow-2, prompt del emblema hero de constelación) → task `01a03c04-ac35-7557-add9-bc7dccd8161c` → poll `get_task` (queued → generating → completed en ~5 min) → `get_creation_content` descargó el SVG completo + preview PNG (creation `01a03c04-ac3d-7e20-9057-176bff018b97`).
- La generación de prueba no se desperdició: es el emblema hero del ticket 07 (constelación circular, line art, strokes-only — listo para draw-in).
- Dato operativo: arrow-2 tarda ~5 min por generación; presupuestar eso en el 07 para los stretch.

## Comments

- 2026-08-25: resuelto por agente — la autorización OAuth (paso humano) ya estaba hecha; se verificó el pipeline completo y los créditos.
- 2026-08-25 (noche): re-verificado e2e a pedido del usuario antes de arrancar el 07: `create_generation` (arrow-2, monograma GX) → `get_task` (queued → completed en ~45 s, task `01a03c0c-8192-7a8c-be43-68104543e367`) → `get_creation_content` descargó el SVG. Costo 0 créditos. Ojo: esta corrida tardó ~45 s, no los ~5 min de la primera — el presupuesto de tiempo del 07 sobró.
