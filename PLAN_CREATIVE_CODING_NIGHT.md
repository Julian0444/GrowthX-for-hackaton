# Plan detallado — Creative Coding Night (a16z · QuiverAI · Cursor)

> Objetivo: top 3 en un evento que premia **belleza visual e interactividad** → conversación speedrun con a16z.
> Estrategia: no tocar backend/scraping. Convertir el mapa en *"el mapa vivo del mundo developer"*.
> Requisitos duros: usar Quiver AI + Cursor, página deployada.

---

## 0. Hechos técnicos del codebase (verificados, no supuestos)

Todo el plan se apoya en esto:

| Hecho | Dónde | Implicación |
|---|---|---|
| Canvas SVG 980×560, `geoMercator` scale 152 center [12,20] | `lib/atlas/signal-layout.ts:4-7` | Cualquier capa nueva se posiciona con `projectCity(lng, lat)` |
| Cámara imperativa por rAF: setea `transform` del `<g>` raíz y counter-scale `scale(1/k)` en cada marker registrado | `hooks/use-atlas-camera.ts:49-66` | Cero re-renders por frame. Las capas nuevas viven DENTRO del grupo (escalan con zoom); lo que no deba escalar se registra vía `registerMarker` |
| Estados de vista como clases CSS: `.state-idle/.analyzing/.results/.selected/.campaign` sobre `.atlas` | `atlas-shell.tsx:706` | Toda la coreografía nueva es CSS colgado de esas clases — sin tocar la máquina de estados |
| Bandas de zoom como clases: `.zoomed` (k>1.7), `.zoomed2` (k>2.2) | `use-atlas-camera.ts:61`, CSS 243-245 | Revelado por nivel de zoom ya resuelto — enganchamos labels de eventos ahí |
| Toggles de capas como clases: `.layer-off-events` etc. | CSS 246-247 | La capa de eventos vivos respeta el toggle existente gratis |
| Señales deterministas: RNG `mulberry32` sembrado + `hashSeed(id)`, coords redondeadas | `signal-layout.ts:62-94` | REGLA: toda geometría nueva debe ser determinista (nada de `Math.random()`/`Date.now()` en render) o rompe hydration |
| 136 eventos reales con lat/lng/nombre/fecha/asistencia: 64 SF + 72 NYC | `data/seed/sf-events.json`, `nyc-events.json` | La capa "mundo vivo" usa datos 100% reales |
| Tokens de diseño centralizados: `--ocean/--land/--border-geo/--ink/--signal-*/--panel/...` | `globals.css:177-207` | El re-tema es cambiar tokens… pero hay ~25 valores hardcodeados fuera de tokens (auditados abajo) |
| `prefers-reduced-motion` mata toda animación | CSS 894-900 | Las animaciones nuevas quedan cubiertas automáticamente |
| Fixtures deterministas del backend + modo degradado con warnings | `lib/server/demo/fixtures.ts` | La demo puede correr sin APIs externas; hay que silenciar el banner en modo demo |
| Ruta OG existente | `app/api/og` | El asset de Quiver puede alimentar la OG image del deploy |
| Mobile bottom sheet + touch targets ya resueltos | CSS 832-892 | No lo tocamos; QA final en desktop (proyector) |

---

## M1 — Tema "Atlas Night" (mayor impacto / primera prioridad)

### 1a. Auditoría de hardcodes (pre-requisito, ~1h)

El re-tema NO es solo cambiar `:root`. Valores fuera de tokens que hay que migrar primero:

**En TSX:**
- `signal-cloud-layer.tsx:36,46` — `fill="#111"` en puntos de demanda → `fill="var(--signal-ink)"` (token nuevo)
- `signal-cloud-layer.tsx:61,74,89` — `stroke="#111"` en glifos → `stroke="var(--signal-ink)"`
- `world-map.tsx:91-95` — gradiente `haloG` con `rgba(17,17,17,…)` → duplicar def como `haloG-night` o parametrizar con tokens

**En CSS (globals.css), literales `rgba(17,17,17,…)` / `#fff` a tokenizar:**
- Scan band (423, 427), intake backdrop `rgba(245,245,242,0.55)` (372), `.user-location .ring fill:#fff` (267), `.marker .tag rect` sombra (279), `.rail-item.active` blancos (478-481), `.event-card .cal background:#fff` (597), `.zoom-btn:hover background:#fff` (767), `.copy-btn background:#fff` (653), `.track-input background:#fff` (710), `.momentum-card` gradiente (527), `.search-go`/`.intake-go`/`.btn-primary` `color:#fff` (339, 410, 619), `.signal-status` verdes/ámbar/rojos (559-561 — necesitan variantes AA sobre oscuro), `.arena-*` (902+ — fuera de alcance, no se tematiza).

Táctica: introducir ~8 tokens nuevos (`--signal-ink`, `--on-ink` para texto sobre botones oscuros, `--surface-raised`, `--scan-tint`, `--status-ok/warn/err`) y reemplazar literales. Commit separado ANTES de tocar la paleta → si algo se rompe, bisect trivial.

### 1b. Paleta Night (valores concretos, punto de partida)

Scope: atributo `data-theme="night"` en el div `.atlas` (no en `html` — no interfiere con shadcn/dark existente). Bloque CSS `.atlas[data-theme="night"] { … }` redefine tokens:

```css
--ocean: #060A13;            /* océano espacio profundo */
--land: #0C1322;             /* tierra apenas más clara */
--border-geo: #1B2436;       /* bordes de países, sutiles */
--border-geo-active: #3B4C6B;
--ink: #E9EDF5;              /* texto primario AA/AAA sobre ocean */
--ink-2: #97A3B8;
--ink-3: #5F6C82;
--signal-ink: #67E8F9;       /* señales = LUZ cian (antes tinta #111) */
--accent: #FFB454;           /* ámbar: rank #1, selección, CTA glow */
--panel: rgba(12,18,32,0.80);
--panel-border: rgba(151,163,184,0.14);
--hairline: rgba(151,163,184,0.10);
--shadow-panel: 0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(103,232,249,0.04);
--scan-tint: rgba(103,232,249,0.07);
--on-ink: #0A0F1A;           /* texto sobre botones claros en night */
```

Reglas de la paleta: 1 dominante (azul-negro), 1 luz (cian) para TODO lo que sea señal/dato, 1 acento (ámbar) SOLO para rank #1/selección/CTA. Nada más. El botón primario en night invierte: fondo `--ink` claro, texto `--on-ink`.

### 1c. Glow barato (regla de performance)

- PROHIBIDO `filter: drop-shadow` por punto (cientos de nodos = GPU muerta).
- Puntos de demanda: el "glow" es el color cian con opacidad — cero costo.
- Markers de oportunidad (≤8 nodos): sí llevan `filter: drop-shadow(0 0 6px rgba(103,232,249,0.5))` en `.marker .core`; el seleccionado, ámbar.
- Pulsos de eventos (M2): glow = segundo círculo blur-less de radio 2.2× con opacidad 0.15 — dos primitivas, sin filtros.
- Viñeta de escenario: `radial-gradient` fijo en `.map-stage::after` (1 nodo DOM).

### 1d. Switch y default

- `atlas-shell.tsx`: leer `?theme=` en el efecto de URL params existente (línea ~480, ya parsea `linq/q/goal`); default `night`, `?theme=paper` restaura el actual. Estado en el shell, atributo en el div raíz.
- Toggle sol/luna en `atlas-header.tsx` junto al reset (mismo estilo `.reset-btn`).

**Criterio de aceptación M1:** los 5 estados de vista + drawer + campaign + layers popover legibles AA en night; cero `#111`/`#fff` literales restantes en el path del atlas; `?theme=paper` pixel-igual a hoy; captura en proyector (o brillo 100%) legible a 3 metros.

---

## M2 — El mundo vivo: 136 eventos reales pulsando

### 2a. Módulo de datos `lib/atlas/live-events.ts` (nuevo)

```ts
import sf from "@/data/seed/sf-events.json"
import nyc from "@/data/seed/nyc-events.json"
// En módulo scope (determinista, corre igual server/cliente):
export type LiveEvent = { id, name, x, y, r, ringDelay, ringDur, tier }
```
- `x,y` = `projectCity(lng, lat)` + `round1`.
- `r` = escala log de `expectedAttendance` (36→0.7, 500→2.4), `round2`.
- `ringDelay` = `(hashSeed(id) % 8000) / 1000` s; `ringDur` = `3.4 + (hashSeed(id+"d") % 1800)/1000` s → los 136 pulsos quedan desincronizados de forma estable (sin hydration mismatch).
- `tier` = `"hero"` si attendance ≥ p75, si no `"base"` — a zoom mundo solo pulsan los hero (~34), el resto son puntos fijos; a `.zoomed` pulsan todos. Presupuesto de nodos animados controlado.

### 2b. Componente `components/atlas/live-event-layer.tsx` (nuevo)

- `<g className="live-events">` montado en `world-map.tsx` entre `LandLayer` y `SignalCloudLayer`. Memo, sin props dependientes de cámara → nunca re-renderiza.
- Por evento: `<g className="lev tier-hero" style={{ "--d": delay, "--dur": dur }}>` con `<circle class="lev-ring">` + `<circle class="lev-core">`.
- CSS: `.lev-ring { animation: atlas-event-pulse var(--dur) ease-out var(--d) infinite; transform-box: fill-box; transform-origin: center }`, keyframe `scale(0.4)→scale(3)` + opacity 0.5→0. Solo `transform`/`opacity` (compositor).
- Respeta `.layer-off-events` (mismo selector patrón línea 246).
- Zoom-labels: a `.zoomed2`, los `tier-hero` muestran `<text>` con el nombre real del evento (mismo patrón de opacity que los glifos actuales). El momento "wow" de zoom: SoMa se despliega en veinte venues con nombre.
- Contraste con capa ambiente: la textura ambiente (23 hubs sintéticos) baja a opacidad 0.5 en night para que los 136 reales dominen. Un token `--ambient-dim`.

### 2c. Historia de datos honesta

Chip flotante junto al rail (solo night/demo): `“136 real events · SF + NYC · live from Luma”`. Los jueces del evento son gente de datos — decir que la textura ambiente es estética y los pulsos son reales SUMA credibilidad.

**Criterio de aceptación M2:** 60fps sostenidos en idle con Chrome FPS meter (M-series y un laptop mediocre de prueba); pulsos visibles desde 3m; zoom a SF revela nombres reales; toggle Events apaga la capa.

---

## M3 — Arcos animados (results → coreografía de llegada)

### 3a. Geometría `lib/atlas/arcs.ts` (nuevo)

- `buildArcs(origin: [x,y] | null, results: Opportunity[]): Arc[]` — origen = `userLocation` si existe, si no SF (`projectCity(-122.42, 37.77)`).
- Path = bézier cuadrática en espacio canvas: control = punto medio + normal perpendicular × `0.18 × dist` (clamp 12–60). `M x0 y0 Q cx cy x1 y1`. (No hace falta gran círculo geodésico: a esta escala visual la cuadrática es indistinguible y es 10× más simple que samplear `geoInterpolate`.)
- Determinista, `round1` en todo.

### 3b. Componente `components/atlas/arc-layer.tsx` (nuevo)

- Monta solo en `state-results/selected/campaign` (mismo gate que markers, `atlas-shell` ya pasa `view`).
- Por arco: `<path class="arc">` + cometa `<circle r=1.4 class="arc-comet"><animateMotion dur="2.8s" repeatCount="indefinite" begin="{delay}s" path="{d}"/></circle>` (SMIL: cero JS por frame).
- Dibujado de entrada: `stroke-dasharray: var(--len); stroke-dashoffset: var(--len)` → transición a 0 con delay escalonado por rank. `--len` medido con `getTotalLength()` en un `useLayoutEffect` una sola vez por set de resultados (los paths no cambian después).
- Timing: la cámara vuela 900ms (`resultsFrame`) → arcos empiezan a dibujarse a los 950ms, 240ms entre cada uno, cometas arrancan al terminar su arco.
- En `state-selected`: arcos no seleccionados bajan a opacidad 0.15; el del seleccionado sube a ámbar. Solo CSS (`.state-selected .arc:not(.to-selected)`), la clase `to-selected` la pone el componente comparando con `selectedId`.
- `vector-effect: non-scaling-stroke` para que el grosor no explote con zoom (mismo truco que `atlas-land`, línea 235).

**Criterio de aceptación M3:** la secuencia búsqueda→revelado se siente coreografiada (vuelo → arcos → cometas); seleccionar ciudad re-enfoca la luz; cero re-renders de React durante vuelos (verificar con React DevTools profiler).

---

## M4 — Coreografía por estado + micro-detalles

1. **Reveal escalonado de markers**: `opportunity-marker.tsx` acepta `revealDelay` (= `(rank-1) × 180ms`); se aplica como `animationDelay` sobre `atlas-marker-in` (CSS 290) — hoy entran todos juntos. Onda expansiva: `<circle class="shock">` dentro de `.inner`, keyframe scale 1→4 fade 700ms una vez, mismo delay; para rank 1, radio doble + color ámbar.
2. **Analyzing dramático**: la scan band (CSS 420-431) se tiñe con `--scan-tint` cian, y durante `state-analyzing` la capa `live-events` acelera: `.state-analyzing .lev-ring { animation-duration: calc(var(--dur) * 0.45) }` — el mundo "se agita" mientras se lo interroga. Costo: una regla CSS.
3. **Count-up de score**: hook `use-count-up.ts` (nuevo, ~20 líneas, rAF 600ms, respeta reduced-motion) aplicado a `.score-block .big` y al % de confianza del drawer (`opportunity-drawer.tsx`). Los números "aterrizan" al abrir el panel.
4. **Constelación al seleccionar**: en `buildResultClusters`, para el cluster seleccionado ya hay glifos con coords; agregar `<line>` del centro a los 5 glifos más cercanos, `stroke-dasharray` draw-in 400ms al ganar `.selected`. Precomputado, cero JS en runtime.
5. **Idle ken-burns**: pan lentísimo automático en idle: en `use-atlas-camera`, si `view==="idle"` y no hubo interacción en 5s, drift sinusoidal de `cam.x` ±12 unidades con período 40s (dentro del rAF loop existente, tick solo cuando idle). Cancelado por `pointerdown` (handler ya existe). La página nunca está muerta en la mesa de demos.

**Criterio de aceptación M4:** grabación de 20s del flujo completo se ve "dirigida" (nada aparece de golpe); en `prefers-reduced-motion` todo sigue funcional y estático.

---

## M5 — Assets Quiver AI (requisito del evento)

### Pipeline

1. OAuth ya configurado (`.cursor/mcp.json` / `.mcp.json`) — falta autorizar en el editor (paso humano).
2. Por asset: `create_generation` → poll `get_task` → `get_creation_content` → guardar en `frontend/public/quiver/` y/o inline como componente en `components/quiver/`.
3. Post-proceso obligatorio: reemplazar fills/strokes fijos por `currentColor` para que respondan a los dos temas; quitar width/height fijos (dejar `viewBox`).

### Lista de assets + prompts borrador

| Asset | Uso | Prompt (borrador) |
|---|---|---|
| Monograma GX | header, favicon, loading | "Minimal geometric monogram combining G and X as a navigation/compass node, single-weight 2px line art, no fill, white on transparent" |
| Glifo evento | `signal-cloud-layer` glifos zoomed2 | "Tiny beacon/pulse icon, 16×16 grid, single 1.5px stroke, geometric, line-art only" |
| Glifo comunidad | ídem | "Three interlocking circles forming a cluster, 16×16, 1.5px stroke line-art" |
| Glifo empresa | ídem | "Minimal building/chip hybrid icon, 16×16, 1.5px stroke line-art" |
| Emblema hero intake | `onboarding-intake` sobre el título | "Abstract world-map constellation emblem, thin connected nodes and arcs, elegant line art, circular composition" |
| Textura constelación | fondo de `.intake-card` y analysis overlay | "Sparse constellation pattern, dots connected by hairlines, seamless, very low density, line art" |
| OG image base | `app/api/og` | composición con el emblema + wordmark |

- El emblema hero entra con **stroke draw-in** (todos los paths con `stroke-dasharray` animado secuencial) — es la primera pantalla que ve el juez.
- Presupuesto: ~8-12 generaciones; los créditos semanales gratis lo cubren (per docs de billing MCP).
- **Fallback si Quiver falla/lento**: los glifos actuales quedan; el requisito "usó Quiver" se cubre con cualquier subconjunto + mencionarlo en la demo. No bloquea nada más.

**Criterio de aceptación M5:** ≥4 assets Quiver visibles en la app en ambos temas; carpeta `public/quiver/` versionada; una línea en el README de qué se generó con Quiver (los sponsors-jueces lo van a preguntar).

---

## M6 — Autopilot `?demo=1` (la página se demuestra sola)

### Diseño

`hooks/use-demo-autopilot.ts` (nuevo). El shell ya expone todos los callbacks necesarios (`runSearch`, `selectCity`, `openCampaign`, `closeCampaign`, `closeSelection`, `resetDemo`) — el autopilot es un secuenciador de timers sobre ellos, activado si `?demo=1` (leer en el efecto de URL params existente).

### Guion (loop ~55s)

| t | Acción | Detalle |
|---|---|---|
| 0-4s | idle | mapa respirando + ken-burns |
| 4-7s | typewriter | query "Observability platform for AI agents…" tipeada a 35ms/char en el campo del intake — requiere prop `externalText` en `onboarding-intake.tsx` (cambio de ~10 líneas) |
| 7s | launch | `runSearch(...)` — backend real o fixtures |
| 7-12s | analyzing | radar + agitación (M4.2) |
| 12-20s | results | reveal + arcos + cometas |
| 20-30s | select #1 | vuelo + constelación + count-up; scroll suave programático del drawer |
| 30-40s | campaign | `openCampaign`, pausa en el track sugerido |
| 40-47s | select #2 | comparación implícita |
| 47-50s | reset | vuelta al mundo |
| loop | | |

### Reglas de robustez

- Cualquier `pointerdown` real → `stopAutopilot()` definitivo (listener `once` sobre `.atlas`). El juez toca = es suyo.
- `SEARCH_FAILED` durante demo → un retry a los 3s → si falla de nuevo, saltar a loop desde idle (nunca mostrar el error en pantalla en modo demo).
- `?demo=1` además: oculta `.req-banner.partial` (el warning de GEMINI/Apify degradado — hoy ocupa 3 líneas arriba del mapa y mata la magia) vía clase `demo-mode` en `.atlas`.

**Criterio de aceptación M6:** 10 minutos corriendo en loop sin intervención ni errores visibles; interacción humana lo corta limpio; funciona contra el backend degradado (sin env keys).

---

## M7 — Deploy, respaldo y QA de venue

1. **Build check primero**: `pnpm --dir frontend build` local — arreglar lo que salga ANTES de tocar Vercel.
2. **Vercel**: proyecto sobre `frontend/`; env vars opcionales (GEMINI_API_KEY, tokens Apify) — decisión consciente: **la demo del evento corre SIN ellas** (fixtures/deterministic ranking = rápido y sin dependencia de terceros en vivo). URL limpia (`growthx-atlas.vercel.app` o similar).
3. **Dos URLs para la mesa**: `/?demo=1` (loop autónomo) y `/` (para dar el mouse al juez).
4. **Video de respaldo**: screen-recording 4K del loop completo, 90s, guardado en el teléfono Y laptop (wifi de venue = ruleta).
5. **QA proyector**: brillo 100%, mirar de 3m: ¿se leen los pulsos? ¿el cian satura? Ajustar `--signal-ink`/opacidades (30 min reservados).
6. **Pitch de 30s ensayado**: "No es arte generativo — cada pulso es un evento real que nuestro sistema ingirió de Luma. GrowthX le dice a una devtools company dónde van a aparecer sus próximos usuarios. Con esto ganamos el YC Startup School Hackathon; los assets los generamos con Quiver desde Cursor." → puente a speedrun.

---

## Orden de ejecución, estimaciones y cortes

| Milestone | Est. | Acumulado |
|---|---|---|
| M1 auditoría + night theme | 3.5h | 3.5h |
| M2 live events | 2.5h | 6h |
| M3 arcos | 2.5h | 8.5h |
| M4 coreografía | 2h | 10.5h |
| M5 Quiver (paralelo posible) | 2h | 12.5h |
| M6 autopilot | 2.5h | 15h |
| M7 deploy + QA | 1.5h | 16.5h |

**Línea de corte mínima presentable** = M1 + M2 + M7 (≈7.5h): mapa nocturno con 136 pulsos reales, deployado. Cada milestone posterior suma por encima sin bloquear.

**Regla de commits**: un commit por sub-etapa con la app funcionando (la auditoría 1a separada del re-tema 1b, etc.). Si algo rompe a 2h del evento, `git revert` y se presenta el último estado sano.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Inscripción en waitlist no se aprueba | ? | **Confirmar HOY** — todo lo demás depende de esto |
| OAuth/créditos Quiver fallan | baja | M5 tiene fallback; requisito se cumple con cualquier subconjunto de assets |
| Jank con 136 pulsos en laptop débil | media | tiers hero/base (2a), sin filtros SVG masivos (1c), FPS meter como gate en M2 |
| Backend lento/caído en vivo | media | demo sin env keys = fixtures deterministas; autopilot tolera fallos; video de respaldo |
| Hydration mismatch por geometría nueva | media | regla dura: todo determinista con `hashSeed`/módulo scope (§0); revisar consola en cada milestone |
| Scope creep de último minuto | alta | la línea de corte está escrita arriba; después de M7 no se agregan features, solo se pulen tokens |

## Fuera de alcance (sin cambios)

Backend, scraping, ranking, ingesta Luma, contratos, tests existentes, mobile sheet, ruta `/research`, arena Terac, sonido, WebGL/globo 3D (tiraría la cámara y los estados que ya funcionan).
