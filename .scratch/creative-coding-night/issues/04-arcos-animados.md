# 04: Arcos animados con cometas (results)

**What to build:** Cuando llegan los resultados de una búsqueda, la revelación se corea: la cámara vuela, y entonces arcos de tinta se dibujan escalonados (uno cada ~240ms, por rank) desde el origen del usuario — su ubicación si existe, si no SF — hacia cada ciudad resultado; al completarse cada arco, un cometa lo recorre en loop. Al seleccionar una ciudad, su arco sube al color de acento/selección existente de la paleta y los demás bajan a opacidad 0.15: el foco se re-enfoca hacia lo elegido. Todo vive solo en los estados results/selected/campaign.

Decisiones de la spec: path = bézier cuadrática en espacio canvas (indistinguible del gran círculo a esta escala, 10× más simple), determinista y redondeada; cometas con SMIL `animateMotion` (cero JS por frame); draw-in con `stroke-dasharray` medido una sola vez por set de resultados; trazo con `vector-effect: non-scaling-stroke` para que el grosor no explote con zoom.

**Blocked by:** None (can start immediately — desbloqueado al cortarse el ticket 01; usa la paleta actual)

**Status:** resolved

- [x] Secuencia búsqueda→revelado coreografiada: vuelo de cámara → arcos dibujándose escalonados → cometas arrancando al terminar su arco
- [x] Origen correcto: ubicación del usuario si existe, fallback SF
- [x] Al seleccionar: arco del seleccionado en el acento de selección existente, el resto a opacidad 0.15, solo con CSS por estado
- [x] Grosor de trazo estable a cualquier zoom
- [x] Geometría determinista (sin hydration mismatch); cero re-renders de React durante vuelos (verificado con React DevTools profiler)

Detalle de implementación: sección **M3** de la spec.

## Comments

- 2026-08-25 (desde el ticket 09): el WIP de este ticket (`components/atlas/arc-layer.tsx`, `lib/atlas/arcs.ts`, `tests/atlas/arcs.test.ts` y el montaje de `ArcLayer` en `world-map.tsx`) quedó commiteado tal cual en `287c120` para proteger el trabajo antes del deploy. Compila en build de producción, pasa lint y los 48 tests, así que NO hizo falta arreglar ni desmontar nada. Ojo: desde ese commit cada push a `main` redeploya la URL pública — si un sub-paso deja la app rota, no pushear hasta que compile (regla del plan: un commit por sub-etapa con la app funcionando).

## Comments

- 2026-08-25: **resolved** (agente). Implementado según M3 con dos desvíos de mecanismo, ambos por robustez:
  - **Archivos**: `lib/atlas/arcs.ts` (geometría pura: `arcPath`, `buildArcs`, `arcOrigin`, constantes de timing), `components/atlas/arc-layer.tsx` (capa), `components/atlas/world-map.tsx` (montaje con gate results/selected/campaign, debajo de ubicación y markers), `app/globals.css` (bloque "Arcos de resultados" + reglas en `prefers-reduced-motion`), `tests/atlas/arcs.test.ts` (8 tests: origen, formato/redondeo, combado al norte, clamp 12–60, degenerado, determinismo, escalonado, origen común).
  - **Draw-in**: `pathLength=1` + animación CSS (`atlas-arc-draw`, delay por rank en `--delay`) en vez de `--len` medido + transición. Motivo: los dashes bajo `vector-effect: non-scaling-stroke` se computan en espacio de pantalla en Chromium/WebKit (spec SVG2), así que `getTotalLength()` no serviría para el dashoffset. Mientras se dibuja el trazo escala con la cámara (dashes exactos) con ancho `calc(1px / --arc-a)` (`--arc-a` = `getScreenCTM().a`, capturado una vez al terminar el vuelo); al terminar (`animationend` → `.drawn`) suelta los dashes y pasa a non-scaling-stroke 1px. La única medición JS por set es el largo real de cada arco para la cola del cometa.
  - **Cometas**: SMIL `animateMotion` (cabeza + halo en un `<g>`) + `animate` de `stroke-dashoffset` (cola). `begin="indefinite"` + `beginElementAt(fin del arco)` una vez por arco: un `begin="Ns"` estático es relativo al inicio del documento, no al montaje, y desincronizaría si la búsqueda llega 30s después de cargar. `visibility` va como atributo + `<set>` (un CSS `visibility` le ganaría al valor animado).
  - **Acento de selección** = tinta plena + trazo 1.5px (así se pintan `.marker.selected` y `.rail-item.active`); el "ámbar" del plan cayó con el tema night (spec post-review). No seleccionados a 0.15, solo CSS por estado.
  - **Origen**: `userLocation` `[lng, lat]` del shell, fallback SF. Si un resultado coincide con el origen (p. ej. SF sin ubicación compartida) no lleva arco (degenerado).
  - **Refresh silencioso** (`SEARCH_REFRESHED`): arcos ya coreografiados no se reinician; solo arrancan los nuevos/movidos.
  - **Verificación** (Chrome headless vía Playwright contra el dev server, viewport 1280×720, muestreo cada ~90ms + hook `__REACT_DEVTOOLS_GLOBAL_HOOK__` con atribución por identidad de fibers): cámara estable a ~650ms → arco 1 dibujándose a ~950ms → arco 2 a +240ms → cada cometa visible justo al terminar su arco; `--arc-a` = CTM real; final `stroke-dasharray: none`, 1px, `non-scaling-stroke`; en selected (k=3.1) elegido opacidad 1 / 1.5px y el resto 0.15, grosor estable; Escape vuelve a 0.55; reset desmonta la capa. **Renders durante vuelos**: 0 commits en el vuelo a results; en el vuelo a selected WorldMap/ArcLayer/markers 0 renders — los 2 commits del shell a t≈32/93ms son los cruces de banda de zoom (`k>1.7`, `k>2.2`) preexistentes (plan §0), en los que el subárbol del mapa hace bailout. `prefers-reduced-motion`: arcos ya dibujados sin escalonar, cometas ocultos y sin arrancar. 0 errores/warnings de consola. `tsc`, `eslint` y `node --test` (48/48) en verde.
  - **Git**: el commit `287c120` (20:01, "arcos WIP (04)") arrastró la primera versión verificada. Queda sin commitear el refuerzo del cometa (cabeza + halo + cola más larga, `arc-layer.tsx` y `globals.css`) y este cierre del ticket — verificados con tsc/eslint/tests/navegador sobre el working tree.
