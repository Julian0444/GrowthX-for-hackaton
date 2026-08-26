# 03: Capa de 136 eventos reales pulsando

**What to build:** El mapa deja de estar quieto: los 136 eventos reales de SF y NYC (con nombre, fecha y asistencia, ingeridos de Luma) aparecen como pulsos desincronizados sobre sus coordenadas reales. Sobre la estética paper actual, los pulsos se diseñan como **ondas de tinta/sonar** (anillos que se expanden y desvanecen en la tinta del mapa), no como neón. A zoom mundo solo pulsan los ~34 eventos "hero" (asistencia ≥ p75) y el resto son puntos fijos — presupuesto de nodos animados controlado; al acercar la cámara pulsan todos, y a zoom profundo los hero muestran el nombre real del venue (el momento "wow": SoMa se despliega en veinte venues con nombre). La textura ambiente sintética se atenúa para que los 136 reales dominen.

Chip flotante junto al rail con la historia honesta: **"136 events ingested from Luma · SF + NYC"**. Nunca decir "live": 103 de los 136 eventos ya ocurrieron (snapshots jul–ago, verificado contra los JSON el 2026-08-25). "Ingested" es verdadero, impresionante igual, y no lo pincha ninguna pregunta de juez.

Regla dura: toda la geometría (posición, radio, delays y duraciones de pulso) es determinista — derivada de hash del id del evento, calculada en scope de módulo — para que server y cliente rendericen idéntico sin hydration mismatch. Animación solo con `transform`/`opacity` (compositor), glow = segundo círculo con opacidad, sin filtros SVG.

**Blocked by:** None (can start immediately — desbloqueado al cortarse el ticket 01; usa la paleta actual)

**Status:** resolved

- [x] 136 eventos reales visibles, pulsos desincronizados estables entre recargas; consola sin warnings de hydration
- [x] A zoom mundo pulsan solo los hero; al acercar pulsan todos; a zoom profundo aparecen los nombres reales
- [x] El toggle de capa Events apaga la capa; `prefers-reduced-motion` la deja estática y funcional
- [x] 60fps sostenidos en idle con Chrome FPS meter (verificar también en un laptop mediocre) — medido por rAF en Chrome headless + CPU throttling 4× (ver Answer); el FPS meter en la máquina de la demo lo confirma el 10
- [x] Textura ambiente atenuada para que los eventos reales dominen visualmente
- [x] Chip "136 events ingested from Luma · SF + NYC" visible — sin la palabra "live"
- [ ] Pulsos legibles a 3 metros / en proyector — **no verificable por agente**: pasa al QA de venue (ticket 10). En captura 1440×900 los anillos hero a zoom mundo miden ~20px y el cluster SF/NYC ~40px

Detalle de implementación: sección **M2** de la spec (adaptar la parte de color night a la paleta paper actual).

## Answer

Implementado sobre la paleta paper actual (sin tocar backend ni máquina de estados). Archivos:

- `frontend/lib/atlas/live-events.ts` (nuevo): 136 eventos (64 SF + 72 NYC) calculados en scope de módulo. `r` = log de asistencia, `ringDelay`/`ringDur` = `hashSeed(id)`, `tier` hero si asistencia ≥ p75 (=168) → **34 hero / 102 base**. Export `LIVE_EVENT_CHIP`.
- `frontend/components/atlas/live-event-layer.tsx` (nuevo): `<g class="live-events">` sin props, memo; por evento anillo (`lev-ring`, animado con `transform`/`opacity`, `vector-effect: non-scaling-stroke`), glow (círculo con opacidad, sin filtros), core y `<text>` solo para hero.
- `frontend/components/atlas/world-map.tsx`: montada entre `LandLayer` y `SignalCloudLayer`.
- `frontend/hooks/use-atlas-camera.ts` + `atlas-shell.tsx`: banda nueva `zoomed3` (k > 5) para los labels.
- `frontend/components/atlas/signal-cloud-layer.tsx` + `globals.css`: textura ambiente envuelta en `<g class="ambient">` con token `--ambient-dim: 0.55`.
- `frontend/app/globals.css`: bloque "Eventos reales pulsando", `.layer-off-events .live-events`, override de `prefers-reduced-motion` (anillo estático a 0.22), chip `.data-chip` (sube sobre el rail en results/selected/campaign; oculto en mobile fuera de idle).
- `frontend/lib/atlas/signal-layout.ts`: `hashSeed` pasa a exportarse.

**Desviación documentada — posición de los eventos.** Con `MAX_ZOOM = 9` una ciudad entera mide ~0.25 unidades del canvas (SF 0.24×0.28, NYC 0.25×0.52) → ~4px en pantalla al zoom máximo: los 64 eventos de SF caerían en el mismo pixel y el beat "SoMa se despliega en veinte venues" es geométricamente imposible con coordenadas crudas. Cada evento se dibuja en el **centroide real de su ciudad + offset real ×110** (`SPREAD` en `live-events.ts`): la geografía relativa se preserva (SoMa sigue al sureste de Marina, Brooklyn al sureste de Midtown), el cluster mide ~27 unidades a zoom mundo (como un hub ambiente grande) y se despliega con nombres a k > 5. Los radios del plan (0.7–2.4) se recalibraron a 0.45–2 porque la capa escala con el zoom y a k=9 eran manchas de 40px. Labels truncados a 34 chars; en el núcleo más denso de SF sigue habiendo algo de solapamiento a k=9 (aceptable para el beat; contexto en el marcador seleccionado).

**Verificación (Chrome headless vía CDP contra el dev server, 1440×900, 2026-08-25):**
- SSR: 102 `lev tier-base` + 34 `lev tier-hero` + chip en el HTML; cliente: 136/34, consola sin "hydration"/"did not match"/excepciones (también tras HMR). Módulo de datos determinista: dos ejecuciones → mismo md5.
- Zoom mundo (k 1.02): 34 anillos animados, 0 base. `.zoomed` (k 2.45): 102 base + 34 hero animados. `.zoomed3` (k 9): labels opacity 0.95 (~17px), SF muestra "Night Hack by Founders, Inc.", "YC AI Startup School Afterparty", "WorkOS Agent Night", "Step SF 2026…" etc.
- Toggle Events: `.live-events` opacity 0 → 1 al reactivar. `prefers-reduced-motion: reduce`: `animation: none`, anillo estático 0.22, 136 nodos siguen en el DOM.
- FPS (rAF 3s): idle 120, idle con CPU 4× 111, k=9 120, k=9 con CPU 4× 108. Sin long tasks.
- Ambiente: `.signals .ambient` opacity 0.55. Chip sin overlap con el rail en results (chip y=698–728, rail y=741+).
- `tsc --noEmit`, `eslint`, `node --test`: limpios. Sin commit (no pedido) — el plan §0 sugiere un commit por sub-etapa.
