# Handoff — GrowthX / Growth Atlas

Registro acumulativo de sesiones. Cada sesión agrega una sección fechada abajo; las secciones anteriores no se borran. «Tareas pendientes» y «Bloqueos» reflejan la realidad al cierre de la última sesión.

---

## Session — 2026-09-07 22:53 UTC

### Resumen de la sesión

Se implementó el ticket **01 — Congelar v0 y preparar los oráculos de aceptación** del slice «evaluación persistida de organizadores y eventos de SF» (`.scratch/evaluacion-persistida/`). Julian autorizó explícitamente la implementación (eso reemplaza los avisos de «no autorizado» de `plan/implementation-plan.md`, `plan/finalProduct.md` y los tickets). El ticket quedó en `Status: ready-for-human`, con sección `## Comments` que detalla lo hecho, tests y desvíos. **No se hizo commit ni push**: Julian lo hace él.

Qué se construyó:

- **Costura de runtime** (único cambio fuera de tests): `frontend/lib/server/pipeline/resolve.ts` expone `createSearchResolver(overrides)` para inyectar pipelines, fixture, auditoría y cache aislada. `searchOrFixture` sigue siendo la instancia por defecto con la misma clave de cache (que omite `budgetUsd`, defecto O1), mismo fallback y auditoría. La ruta HTTP no cambia.
- **Harness** `frontend/tests/fixtures/baseline-v0/harness.ts`: alias `@/` para `node --test` vía `module.registerHooks` (los módulos v0 se cargan con `loadV0()` dinámico, nunca con import estático), reloj congelado (`freezeClock`), transporte de repetición que sirve `providers/*.json` y falla ante cualquier URL no grabada, claves falsas fijadas y restauradas, utilidades de manifiesto y `observeOracles()`.
- **Grabaciones controladas** en `providers/` (Apify Trends, Apify X, GitHub, Exa por ciudad, Gemini). Son respuestas preparadas, no observaciones reales. La de Gemini es adversarial a propósito: rank invertido, cita inexistente, cita ajena, cita irrelevante, candidato desconocido.
- **Manifiesto** `manifest.json`: HEAD `480712c` + árbol de trabajo sucio (89 rutas, documentado, nada reseteado), sha256 de 20 fuentes, 9 seeds y 6 fixtures, versiones (node v22.23.2, pnpm 11.8.0, next 16.2.6, ts 5.7.3), reloj de evaluación `2026-09-07T22:28:00.000Z`, política y significado de scores, resultado de la suite previa, sin secretos.
- **Seeds**: 136 eventos (64 SF + 72 NYC) con hash; en el reloj congelado 63 SF y 66 NYC vencidos, 1 y 6 futuros. Ninguna fecha tocada.
- **Caracterización** `characterization.json`: salida v0 con modelo, sin modelo y pipeline local sobre seeds, más 14 predicados de oráculos con su valor v0. No se re-graba tras corregir.
- **Matriz** `oracles.md`: O1 presupuesto → 02, O2 geografía → 03, O3 vigencia → 04, O4 soporte de citas → 05, O5 orden → 06; defecto, ubicación en código, salida v0 observada, salida deseada y receta de reproducción.
- **Test** `frontend/tests/acceptance/baseline-v0.test.ts` (8 casos) y script `test:baseline` en `frontend/package.json`.

Decisiones de diseño no obvias:

- El test de oráculos exige que lo observado sea **el defecto v0 o lo deseado** (y, mientras los hashes de fuentes coincidan con el manifiesto, exactamente el defecto). Así 01 no acepta los defectos como comportamiento esperado ni deja tests rojos; las pruebas roja-sobre-v0 / verde-sobre-corrección las escriben 02–06 reutilizando los mismos predicados.
- La igualdad exacta con `characterization.json` solo se exige sobre v0 (hashes iguales). Cuando 02–06 cambien fuentes, ese test pasa a modo diagnóstico y solo verifica lo que no depende de los defectos.
- No hay script de re-grabación en el repo a propósito, para que v0 no se re-grabe por accidente. Regenerar caracterización y manifiesto requiere un script ad hoc (se usó uno en scratch, no versionado).

### Estado actual

- Rama: `main`. HEAD: `480712c` (Creative coding night: pulido de cometas). Commits recientes: `c8fda5e`, `ef9a65c`, `287c120`, `ffa1f22`.
- Árbol de trabajo sucio desde antes de la sesión (borrado de Linq/Terac/research, ediciones de pipeline, contratos, adaptador, UI, skills sin trackear). Nada de eso se tocó.
- Cambios de esta sesión, sin commitear:
  - `M frontend/lib/server/pipeline/resolve.ts`
  - `M frontend/package.json`
  - `?? frontend/tests/acceptance/` (baseline-v0.test.ts)
  - `?? frontend/tests/fixtures/` (baseline-v0/: harness.ts, manifest.json, characterization.json, oracles.md, providers/)
  - `?? .scratch/evaluacion-persistida/` (spec + 15 tickets; 01 editado: Status, criterios marcados, Comments)
- Tests: `pnpm --dir frontend test` → 43 pass / 0 fail (35 previos + 8 nuevos). `pnpm --dir frontend lint` → limpio. `npx tsc --noEmit` → limpio (tsconfig incluye `tests/**`, así que `next build` los compila).
- Ticket activo: `.scratch/evaluacion-persistida/issues/01-congelar-v0-y-oraculos.md` en `ready-for-human`. Tickets 02–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar el ticket 01 y sus Comments; commitear los cambios de la sesión (resolve.ts, package.json, tests/acceptance, tests/fixtures, .scratch/evaluacion-persistida) con mensaje en español.
2. **Julian**: decidir si el alias `@/` para tests se promueve a un preload compartido (`node --import` en el script `test`, archivo fuera de `tests/fixtures/`). Hoy solo funciona con import dinámico desde el harness; 02–06 lo necesitarán.
3. **Ticket 02** (cache respeta presupuesto): prueba roja sobre la referencia usando `h.runReplay` / `createSearchResolver` y los predicados O1 de `observeOracles()`; corregir `cacheKey` en `resolve.ts` y `cache.ts` / ruta de búsqueda según el ticket. Requiere autorización explícita y pasar a `ready-for-agent`.
4. **Tickets 03–06**: mismo patrón con O2–O5. Cada uno debe fallar sobre v0 y pasar con su corrección; no se aceptan skip/todo. Antes de 07 los cinco deben estar activos y verdes.
5. **Tickets 07–15**: bloqueados hasta cerrar 01–06 y por las decisiones abiertas D1–D5 de `spec.md`.

### Bloqueos y advertencias

- **Autorización por ticket**: `CLAUDE.md` y la spec marcan el slice como «pendiente de revisión humana; no autorizado». La autorización de esta sesión cubrió solo 01. Cada ticket siguiente necesita el visto bueno explícito de Julian y el cambio a `ready-for-agent` antes de arrancar.
- **Alcance por archivos**: Julian pidió tocar solo los archivos que nombra cada ticket y preguntar antes de tocar otro. 01 cumplió sin excepciones.
- **Timers de 4,5 s**: `LIVE_SIGNAL_WAIT_MS` en `global-market-search.ts` no se puede inyectar sin tocar ese archivo (fuera de alcance de 01); la referencia tarda ~5 s. Las caches por término de ese módulo son globales del proceso, así que `failProviders` del harness solo actúa en un proceso fresco.
- **Hallazgo de caracterización**: en v0 la ruta HTTP nunca llega al pipeline local sobre seeds (el ranking mundial siempre devuelve oportunidades y ninguna etapa lanza). El oráculo de vigencia se reproduce llamando `searchOpportunities` y el adaptador directamente. Relevante para 04.
- **Manifiesto y hashes**: cualquier edición de una fuente listada en `manifest.json › sources` (incluido `resolve.ts`) pasa el test de caracterización a modo «fuentes distintas del manifiesto». Es lo esperado para 02–06; no regenerar `characterization.json` con código corregido.
- `node --test` emite warnings `MODULE_TYPELESS_PACKAGE_JSON` (package.json sin `"type": "module"`). Preexistente, inofensivo, no se tocó.
- Memoria del proyecto (`~/.claude/projects/.../memory/`): «en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md».

### Primera acción sugerida para la próxima sesión

Leer `.scratch/evaluacion-persistida/issues/01-congelar-v0-y-oraculos.md` (sección Comments) y `frontend/tests/fixtures/baseline-v0/oracles.md`, correr `pnpm --dir frontend test:baseline` para confirmar la referencia en verde, y esperar la autorización de Julian para 02 (o la decisión sobre el preload del alias `@/`) antes de escribir código.

---

## Session — 2026-09-07 23:26 UTC

### Resumen de la sesión

Se implementó el ticket **02 — Separar búsquedas por presupuesto** (`.scratch/evaluacion-persistida/issues/02-cache-respeta-presupuesto.md`), autorizado explícitamente por Julian (la autorización reemplaza los avisos de «no autorizado» de los docs; cubrió solo este ticket). El ticket quedó en `Status: ready-for-human` con sección `## Comments` completa. **No se hizo commit ni push**: los hace Julian.

Qué se corrigió (oráculo O1 de la referencia de 01):

- **`frontend/lib/server/pipeline/resolve.ts`**: la clave de cache —que también gobierna el mapa de promesas en curso— ahora incluye `budgetUsd` normalizado. Se exporta `normalizeBudgetUsd(value: unknown): number`, la normalización única del ticket: número finito > 0 pasa tal cual; ausente/0/negativo/`NaN`/`Infinity` caen al sentinel 0 de v0 (presupuesto desconocido; su representación nueva queda para el ticket 07).
- **`frontend/app/api/opportunities/search/route.ts`**: `parseRequest` usa esa misma `normalizeBudgetUsd` en vez de su chequeo inline (`b.budgetUsd > 0`), así parser y clave no pueden divergir. Cambio de borde documentado: antes `Infinity` pasaba como presupuesto positivo; ahora es sentinel 0.
- **`frontend/lib/server/cache.ts`**: sin cambios (el ticket lo listaba como probablemente afectado; `TtlCache` es agnóstica de la clave, el defecto vivía solo en `cacheKey`).
- **Nuevo `frontend/tests/acceptance/cache-budget.test.ts`** (6 casos) sobre el harness de 01: secuencial y concurrente 2.000/20.000 por la frontera de servicio con transporte grabado; proveedor controlado inyectado por `createSearchResolver` que etiqueta qué evaluación produjo cada respuesta (equivalentes comparten cache y trabajo pendiente); fallo del proveedor (conserva `degraded`/warnings, cada fallback con el `query` de su presupuesto, degradada no se cachea); `POST` real del route bajo replay (incluye sentinel: ausente y −50 comparten evaluación entre sí y no la de un presupuesto positivo); caracterización directa de `normalizeBudgetUsd`.

Decisiones de diseño no obvias:

- **Rojo/verde verificado de verdad**: el test se escribió primero y se corrió contra la v0 sin corregir → 6/6 en rojo; con la corrección → 6/6 en verde. Como preveía 01, `baseline-v0.test.ts` pasó a modo diagnóstico (fuentes con drift respecto del manifiesto: `resolve.ts` y `route.ts`) y registra los predicados O1 como «corregido»; `characterization.json` no se re-grabó.
- **`next/server` bajo `node --test`**: el specifier no resuelve fuera de Next; el test registra un gancho `registerHooks` local (solo en su proceso) que lo mapea a `next/server.js` para ejercer el `POST` real del route. No se tocó el harness de 01 (fuera del alcance del ticket).
- **Top-level await**: el tsconfig no lo admite en tests (los compila `next build`); el test carga los módulos v0 vía una promesa a nivel de módulo que cada caso espera.
- No se exige que los scores difieran entre presupuestos (como anticipa el ticket); se prueba que ninguna respuesta provenga de la evaluación de otro presupuesto (`query`/`requestId`/etiqueta del proveedor controlado).

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en esta sesión ni en la anterior).
- Cambios sin commitear de las dos sesiones del slice (además del árbol sucio preexistente ajeno, que no se tocó):
  - `M frontend/lib/server/pipeline/resolve.ts` (costura de 01 + corrección de 02)
  - `M frontend/app/api/opportunities/search/route.ts` (02)
  - `M frontend/package.json` (01: script `test:baseline`)
  - `?? frontend/tests/acceptance/` (baseline-v0.test.ts de 01, cache-budget.test.ts de 02)
  - `?? frontend/tests/fixtures/` (baseline-v0/ de 01)
  - `?? .scratch/evaluacion-persistida/` (spec + 15 tickets; 01 y 02 en `ready-for-human`)
- Tests: `pnpm --dir frontend test` → 49 pass / 0 fail (43 previos + 6 nuevos). `pnpm --dir frontend lint` → limpio (exit 0). `npx tsc --noEmit` → limpio.
- Tickets: 01 y 02 en `ready-for-human`; 03–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 01 y 02 y commitear todo lo del slice (mensaje en español).
2. **Julian**: sigue abierta la decisión sobre promover el alias `@/` a un preload compartido (`node --import`); 02 se resolvió sin necesitarlo (promesa a nivel de módulo), pero 03–06 podrían quererlo.
3. **Ticket 03** (geografía con alcance, O2): requiere autorización explícita y pase a `ready-for-agent`. Mismo patrón que 02: prueba roja sobre la referencia con los predicados O2 de `observeOracles()`, corrección en `global-market-search.ts › cityForCountry` y `exa-events.ts › toEvidence`.
4. **Tickets 04–06**: O3–O5, mismo patrón (rojo sobre v0, verde con la corrección; sin skip/todo). Antes de 07 los cinco oráculos deben estar activos y verdes (O1 ya lo está).
5. **Tickets 07–15**: bloqueados hasta cerrar 03–06 y por las decisiones abiertas D1–D5 de `spec.md`.

### Bloqueos y advertencias

- **Autorización por ticket**: cada ticket siguiente (03 en adelante) necesita el visto bueno explícito de Julian y el cambio a `ready-for-agent` antes de arrancar. Alcance: solo los archivos que nombra cada ticket; preguntar antes de tocar otro.
- **Drift esperado del manifiesto**: `resolve.ts` y `route.ts` ya difieren de `manifest.json › sources`; `baseline-v0.test.ts` corre en modo diagnóstico y así debe seguir. No regenerar `characterization.json` ni el manifiesto con código corregido.
- **03 tocará más fuentes con drift** (`global-market-search.ts`, `exa-events.ts`): mismo comportamiento esperado.
- Siguen vigentes las advertencias de la sesión anterior: timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso (`failProviders` solo en proceso fresco; 02 lo esquivó inyectando el proveedor por `createSearchResolver`), warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/02-cache-respeta-presupuesto.md`, correr `pnpm --dir frontend test` para confirmar 49/49 en verde, y esperar la autorización de Julian para el ticket 03 antes de escribir código.

---

## Session — 2026-09-08 00:04 UTC

### Resumen de la sesión

Se implementó el ticket **03 — Conservar el alcance geográfico de la evidencia** (`.scratch/evaluacion-persistida/issues/03-geografia-con-alcance.md`), autorizado explícitamente por Julian (cubrió solo este ticket). El ticket quedó en `Status: ready-for-human` con `## Comments` completa (qué se hizo, tests con salida real, desvíos). **No se hizo commit ni push**: los hace Julian.

Qué se corrigió (oráculo O2 de la referencia de 01 — «señal nacional presentada como mercado urbano; ciudad de la consulta copiada al resultado de Exa»):

- **Contrato `frontend/lib/contracts/growxth.ts`** (archivo ADICIONAL a la lista del ticket, autorizado en sesión vía AskUserQuestion): `market.city` pasa a `string | null` (null = ciudad pendiente) y se agrega `market.explorationCity?: string | null`, documentado como inferencia del sistema que nunca alimenta ubicación factual, elegibilidad ni recomendación de eventos. Solo tipos. Julian aclaró además que la lista de archivos de los tickets es orientativa, no una allowlist: incluir los cambios mínimos necesarios en contratos y consumidores.
- **`lib/server/markets/city-catalog.ts`**: alias separados en `aliases` (ciudad/metro) y `regionAliases` (estado/provincia/país: `germany`, `karnataka`, `california`, `argentina`, …). Nuevo `resolveMarketCityScoped(location)` → `{ city, scope: 'city' | 'region' | 'country' }`; `resolveMarketCity` conserva firma y resultado. Nuevo `cityLevelNames(city)` (nombre + alias urbanos) para comprobar si un texto nombra de verdad la ciudad.
- **`lib/server/pipeline/global-market-search.ts`**: señales X/GitHub llevan `geoScope` (X además `declaredLocation`). `market.city` solo se afirma con alguna señal de alcance urbano o para candidatos curados `prepared`; con señales solo país/región queda `city: null` + `explorationCity`, y título/subtítulo/headline/campaña hablan del país con la hipótesis etiquetada. La evidencia de X conserva la declaración original como `location`; las razones de X/GitHub citan lo declarado sin traducirlo a la ciudad; `momentumSignals` declaran base `country` cuando ninguna ubicación es urbana.
- **`lib/server/discovery/exa-events.ts`**: `location` del resultado solo si la propia página nombra la ciudad o un alias urbano; sin eso queda `null` (pendiente) y la razón lo dice. La hipótesis sigue orientando la búsqueda (imprescindible: O3/ticket 04 reproduce su recap desde la grabación `exa:Bengaluru`). El import de city-catalog es relativo (no `@/`) para que `node --test` resuelva sin gancho de alias.
- **`lib/api/opportunity-adapter.ts`**: con `city` null la UI recibe `«<ciudad> (hypothesis)»` como etiqueta visible; el fallback por subtítulo ya no reintroduce la ciudad; `country` se conserva para el resaltado del mapa. **`components/atlas/evidence-links.tsx`**: muestra la ubicación publicada por la fuente o «Location pending» para un event_listing sin lugar.
- **Tests**: nuevo `frontend/tests/acceptance/geographic-scope.test.ts` (3 casos: país, ciudad explícita, ciudad solo en la query; normalización → respuesta → proyección de UI, con aserción de valor + aserción de estado/alcance en cada nivel). `tests/markets/global-market-search.test.ts` actualizado: país→ciudad ya no prueba observación urbana (exige `city: null` + `explorationCity` para India; conserva London/Buenos Aires con lugar explícito).

Decisiones de diseño no obvias:

- **Rojo/verde verificado**: el test de aceptación se corrió contra v0 sin corregir → 3/3 en rojo; con la corrección → 3/3 en verde.
- **Sin cambios en `labels.ts` y `world-map.tsx`** (listados como «probablemente afectados»): la auditoría ya es correcta (la página de Exa sigue `observed` por URL+fecha; lo que queda pendiente es su `location`), y el mapa recibe la etiqueta desde el adaptador y resalta por `country`.
- **`prepared` conserva `market.city`**: son candidatos curados con etiqueta visible, no inferencia desde señal nacional; el test de fallback existente sigue igual.
- **Cambio de comportamiento menor**: la pasada por alias urbanos ahora precede a la regional («Mumbai, Maharashtra» resuelve Mumbai; antes Pune por el alias de estado). Ninguna grabación ni test dependía del comportamiento previo.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en las tres sesiones del slice).
- Cambios sin commitear del slice (además del árbol sucio preexistente ajeno, no tocado):
  - `M frontend/lib/contracts/growxth.ts` (03 — contrato)
  - `M frontend/lib/server/markets/city-catalog.ts`, `M frontend/lib/server/pipeline/global-market-search.ts`, `M frontend/lib/server/discovery/exa-events.ts` (03)
  - `M frontend/lib/api/opportunity-adapter.ts`, `M frontend/components/atlas/evidence-links.tsx` (03; ambos ya tenían ediciones preexistentes ajenas)
  - `M frontend/tests/markets/global-market-search.test.ts` (03)
  - `M frontend/lib/server/pipeline/resolve.ts` (01+02), `M frontend/app/api/opportunities/search/route.ts` (02), `M frontend/package.json` (01)
  - `?? frontend/tests/acceptance/` (baseline-v0 de 01, cache-budget de 02, geographic-scope de 03), `?? frontend/tests/fixtures/` (01), `?? .scratch/evaluacion-persistida/` (spec + 15 tickets)
- Tests: `pnpm --dir frontend test` → **52 pass / 0 fail** (49 previos + 3 nuevos). `pnpm --dir frontend lint` → exit 0. `npx tsc --noEmit` → limpio.
- `pnpm --dir frontend test:baseline` (diagnóstico, drift esperado que ahora incluye `growxth.ts`, `global-market-search.ts`, `exa-events.ts`, `city-catalog.ts`, `opportunity-adapter.ts`): **O1 y O2 «corregido»**, O3–O5 «defecto v0 vigente», sin INESPERADO. No se regeneraron `characterization.json` ni el manifiesto.
- Tickets: 01, 02 y 03 en `ready-for-human`; 04–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 01–03 y commitear todo lo del slice (mensaje en español). El de 03 incluye el contrato: revisar que `explorationCity` como campo separado y etiquetado cumpla su condición («no alimenta ubicación factual, elegibilidad ni recomendaciones de eventos en SF»).
2. **Ticket 04** (vigencia y fechas desconocidas, O3): requiere autorización explícita y pase a `ready-for-agent`. Mismo patrón: rojo sobre la referencia con los predicados O3, corrección en `search-opportunities.ts` (razón «upcoming»), `opportunity-adapter.ts › toEvents` (no sustituir fecha ausente por `new Date()`) y `exa-events.ts` (recap no citado como listing vivo). Nota: O3 se reproduce llamando `searchOpportunities` y el adaptador directamente (la ruta HTTP no llega al pipeline local en v0).
3. **Tickets 05–06**: O4–O5, mismo patrón. Antes de 07, los cinco oráculos activos y verdes (O1 y O2 ya lo están).
4. **Tickets 07–15**: bloqueados hasta cerrar 04–06 y por las decisiones abiertas D1–D5 de `spec.md`.
5. Sigue abierta la decisión de promover el alias `@/` a un preload compartido (`node --import`); 03 lo esquivó igual que 02 (promesa a nivel de módulo + imports relativos).

### Bloqueos y advertencias

- **Autorización por ticket**: 04 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent` antes de arrancar. La lista de archivos de cada ticket es orientativa (aclaración de Julian en esta sesión): cambios mínimos necesarios en contratos y consumidores están permitidos, documentándolos en el ticket.
- **Drift del manifiesto ampliado**: siete fuentes difieren ya del manifiesto v0 (se suman las cinco de 03 a `resolve.ts` y `route.ts`); `baseline-v0.test.ts` sigue en modo diagnóstico y así debe seguir. 04 sumará `search-opportunities.ts` (y reutilizará `exa-events.ts`/`opportunity-adapter.ts`, ya con drift).
- **Interdependencia 03↔04**: la búsqueda de Exa para la hipótesis (`exa:Bengaluru`) debe seguir ocurriendo; si 04 tocara el targeting de Exa, cuidar que el recap `observability-day-india-recap` siga sirviéndose, porque el predicado O3 lo necesita presente (con `citedAsLive: false` como salida deseada).
- Siguen vigentes: timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso, warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/03-geografia-con-alcance.md`, correr `pnpm --dir frontend test` para confirmar 52/52 en verde (y `test:baseline` para ver O1/O2 «corregido»), y esperar la autorización de Julian para el ticket 04 antes de escribir código.

---

## Session — 2026-09-08 01:23 UTC

### Resumen de la sesión

Se implementó el ticket **04 — Excluir eventos vencidos y conservar fechas desconocidas** (`.scratch/evaluacion-persistida/issues/04-vigencia-y-fechas-desconocidas.md`, oráculo O3), autorizado explícitamente por Julian (cubrió solo este ticket). El ticket quedó en `Status: ready-for-human` con `## Comments` completa (qué se hizo, rojo/verde, desvíos, salida real de tests). **No se hizo commit ni push**: los hace Julian.

Qué se corrigió (O3: seeds vencidos citados como «upcoming»; fecha ausente reemplazada por `new Date()` en el adaptador; recap de evento pasado contado como listing vivo por su publicación reciente):

- **Política temporal nueva `frontend/lib/temporal/event-validity.ts`** (la «política pequeña reutilizable por el slice»; sin imports de servidor): `classifyEventValidity(startsAt, evaluationInstant)` → `upcoming | past | date_pending | date_ambiguous` con motivo visible y rango UTC posible. Corte = inicio declarado vs. instante de evaluación (refinar con `endsAt`/restricciones queda para D2). Sin zona explícita evalúa el rango real de offsets UTC (−12:00…+14:00): solo `past`/`upcoming` si vale bajo cualquier zona; si el instante cae dentro del rango → `date_ambiguous`. Ausente/inválida → `date_pending`, nunca `new Date()`.
- **`lib/server/graph/derive-signals.ts`**: `deriveRuntimeGraph(graph, request, evaluationInstant?)` clasifica cada evento; el candidato por comunidad sale solo de eventos `upcoming` cuando existen; `RuntimeCommunity.eventValidity` nuevo; el excerpt de evidencia Luma solo dice «Upcoming» si la política lo respalda (vencido → «Past event … historical antecedent»).
- **`lib/server/pipeline/search-opportunities.ts`**: elegibilidad temporal ANTES del score (candidato no-upcoming no se convierte en oportunidad) con warnings de motivo y conteo; evidencia/sourcesUsed se registran igual que v0 para TODOS los candidatos (cobertura idéntica a la caracterización, requisito del modo diagnóstico).
- **`lib/server/discovery/exa-events.ts`**: la vigencia del resultado se decide por la fecha del EVENTO nombrada en la página («15 October 2026», «held on 12 August 2026», ISO), nunca por `publishedDate` ni obtención. Recaps de eventos pasados quedan como Evidence consultable (URL + publicación intactas) pero NO se citan en la razón de listados; la razón lo identifica y declara pendientes fechas/lugares ausentes.
- **`lib/api/opportunity-adapter.ts`**: `toEvents` clasifica al proyectar (una oportunidad puede caducar entre snapshot y vista); solo `upcoming` con fecha real se presenta como «próximo evento»; ausente queda `null` en el contrato crudo y la proyección legacy no fabrica el evento; la fuente sintética usa `generatedAt` + `isEstimated: true` en vez de `new Date()` + false.
- **`lib/api/atlas-client.ts`**: el fallback del cliente agrega el warning «N eventos del fixture ya ocurrieron; son antecedentes históricos, no oportunidades vigentes» (contado con la política).
- **`components/atlas/event-import.tsx`**: nota de validez visible en el import de Luma (past / date pending / date ambiguous) con la misma política; `""` del parser = fecha ausente.
- **Test nuevo `frontend/tests/acceptance/event-validity.test.ts`** (8 casos): política pura (límites, medianoche, zonas), demo de los 4 eventos con reloj congelado + caducidad al mover el reloj, seeds (0 vencidos como «upcoming»), adaptador, Exa, estabilidad del predicado O4.1, y fallbacks del servidor (resolver con pipelines caídos) y del cliente (fetch fallido).

**Rojo/verde verificado**: test + política escritos primero → 6/7 en rojo sobre v0 (solo la política pura, módulo nuevo, en verde); con la corrección → 8/8 en verde.

**Desvío autorizado en sesión (AskUserQuestion)**: al dejar de citarse el recap de Berlín cambió el conjunto de «citas propias» y el predicado O4.1 del harness de 01 (v0 documentado como lista literal de ids recalculada en vivo) rompía «el valor v0 documentado no cambió». Julian autorizó tocar `tests/fixtures/baseline-v0/harness.ts` y la entrada `oracles.O4.8` de `characterization.json` con condiciones, cumplidas así: predicado conductual `narrativeSubstitutionObservable(publishedIds, ownIds)` → `{ published, substitutedWithOwnCitations }` (no depende de cantidad/lista de ids); v0 documentado = constante `{ published: true, substitutedWithOwnCitations: true }` derivada de la captura congelada (el test de estabilidad la verifica aplicando el predicado a `characterization.json`, nunca al pipeline actual); caso «cambian las citas sin cambiar el comportamiento» en `event-validity.test.ts`. La salida v0 congelada (replay/deterministic/local) NO se re-grabó.

Decisiones no obvias:

- **`lib/api/luma.ts` y `lib/api/types.ts` sin cambios** (listados como probablemente afectados): cambiar `EventOpportunity.startsAt` a `string | null` arrastraba `opportunity-drawer.tsx` (fuera de alcance); «pendiente» se expresa no fabricando el evento en la proyección legacy (el contrato crudo sí conserva `null`), y la identificación visible la hace `event-import.tsx`.
- **`resolve.ts` no se tocó** para el fallback del servidor: el punto de contención es el adaptador (ambos fallbacks fluyen por él); el test lo demuestra inyectando pipelines caídos en `createSearchResolver`.
- Vencido = inicio declarado anterior al instante de evaluación bajo cualquier zona posible; empezar exactamente en el instante de evaluación no es vencido (coincide con el predicado O3).
- Interdependencia 03↔04 respetada: `exa:Bengaluru` se sigue consultando y el recap se sirve con `citedAsLive: false`.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en las cuatro sesiones del slice). Árbol sucio preexistente ajeno intacto (98 rutas en total).
- Cambios de esta sesión, sin commitear:
  - `?? frontend/lib/temporal/` (event-validity.ts, nuevo)
  - `M frontend/lib/server/graph/derive-signals.ts`, `M frontend/lib/server/pipeline/search-opportunities.ts`, `M frontend/lib/server/discovery/exa-events.ts`
  - `M frontend/lib/api/opportunity-adapter.ts`, `M frontend/lib/api/atlas-client.ts`, `M frontend/components/atlas/event-import.tsx`
  - Dentro de dirs sin trackear: `tests/acceptance/event-validity.test.ts` (nuevo), `tests/fixtures/baseline-v0/harness.ts` y `characterization.json` (desvío autorizado O4.1), ticket 04 (Status, criterios marcados, Comments)
- Tests: `pnpm --dir frontend test` → **60 pass / 0 fail** (52 previos + 8 nuevos). `pnpm --dir frontend lint` → exit 0. `npx tsc --noEmit` → limpio.
- `pnpm --dir frontend test:baseline` (diagnóstico; drift esperado ahora suma `search-opportunities.ts` y `derive-signals.ts`): **O1, O2 y O3 «corregido»**, O4/O5 «defecto v0 vigente», sin INESPERADO.
- Tickets: 01–04 en `ready-for-human`; 05–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 01–04 (el de 04 incluye el desvío del predicado O4.1) y commitear todo el slice (mensaje en español).
2. **Ticket 05** (explicaciones con soporte, O4): requiere autorización explícita y pase a `ready-for-agent`. Mismo patrón: rojo sobre la referencia con los predicados O4, corrección en `gemini.ts › applyDecision`. Nota: el predicado O4.1 ahora es conductual (`narrativeSubstitutionObservable`; v0 `{published: true, substitutedWithOwnCitations: true}` → deseado `{published: false, substitutedWithOwnCitations: false}`); publicar conservando la cita inexistente daría INESPERADO.
3. **Ticket 06** (orden solo determinístico, O5): mismo patrón. Antes de 07, los cinco oráculos activos y verdes (O1–O3 ya lo están).
4. **Tickets 07–15**: bloqueados hasta cerrar 05–06 y por las decisiones abiertas D1–D5 de `spec.md`.
5. Sigue abierta la decisión de promover el alias `@/` a un preload compartido (`node --import`); 04 lo esquivó igual que 02–03 (promesa a nivel de módulo + imports relativos con extensión `.ts` en módulos nuevos).

### Bloqueos y advertencias

- **Autorización por ticket**: 05 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent` antes de arrancar. La lista de archivos de cada ticket es orientativa (reconfirmado en esta sesión: «los archivos probables del ticket no son una lista cerrada»), pero preguntar antes de tocar archivos de otra índole (esta sesión pidió autorización para el harness de 01 vía AskUserQuestion y la obtuvo con condiciones).
- **Predicado O4.1 reformulado**: quien trabaje 05 debe leer `narrativeSubstitutionObservable` en el harness y el test de estabilidad en `event-validity.test.ts` antes de escribir su prueba roja.
- **Fallback del cliente en tests**: `atlas-client.searchOpportunities` bajo `node --test` cae al fixture porque `fetch` con URL relativa falla en Node; si algún cambio futuro le pone base URL, el test del fallback del cliente necesitará otro mecanismo de fallo.
- **Vigencia en el mundo real**: con el reloj real (post 2026-09-07), los seeds de SF tienen 1 solo evento futuro; el pipeline local sobre seeds devuelve ≤1 oportunidad y el resolver puede caer al fixture (que ahora llega identificado como histórico y sin eventos proyectados). Es el comportamiento pretendido por el ticket.
- Siguen vigentes: timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso, warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/04-vigencia-y-fechas-desconocidas.md` (incluido el desvío del predicado O4.1), correr `pnpm --dir frontend test` para confirmar 60/60 en verde (y `test:baseline` para ver O1–O3 «corregido»), y esperar la autorización de Julian para el ticket 05 antes de escribir código.

---

## Session — 2026-09-08 01:52 UTC

### Resumen de la sesión

Se implementó el ticket **05 — Rechazar explicaciones cuyas citas no respaldan el texto** (`.scratch/evaluacion-persistida/issues/05-explicaciones-con-soporte.md`, oráculo O4), autorizado explícitamente por Julian (cubrió solo este ticket). El ticket quedó en `Status: ready-for-human` con `## Comments` completa (qué se hizo, rojo/verde, desvíos, salida real de tests). **No se hizo commit ni push**: los hace Julian.

Qué se corrigió (O4: narrativa con cita inexistente publicada con citas propias sustituidas; cita ajena y cita real irrelevante aceptadas como soporte):

- **Contrato `lib/contracts/growxth.ts`** (solo tipos): `NarrativeState` (`deterministic_only | validated | rejected`, `note`, `selectedEvidenceIds`) + `Opportunity.narrative?`. Documenta el contrato de salida: la redacción nunca crea hechos publicables; la razón factual visible se compone desde hechos admitidos y plantillas.
- **`lib/server/reasoning/gemini.ts`**: se eliminó el fallback de `applyDecision` (mantenía la narrativa asignándole citas propias). `reviewDecision` valida la selección: cita inexistente, ajena (fuera de los hechos admitidos de ESA oportunidad) o ausente rechazan la decisión ENTERA, sin filtrar ni sustituir citas → se recupera completa la explicación determinística (razones, titular, campaña) con `narrative: rejected` + motivo + warning. Validada → el texto libre del modelo IGUAL no se publica como razón: aporta selección de hechos (`selectedEvidenceIds`) y propuestas de acción con guardia léxica conservadora (cifra/%/moneda en texto libre = propuesta retenida, anotada en `note`). Ninguna validada (p. ej. modelo obedeciendo una descripción con instrucciones de ignorar evidencias) → degradación explícita SIN aplicar el sort por rank: ranking y elegibilidad intactos. Fallos (sin clave, 503, JSON inválido, timeout) → warning + `deterministic_only`. Con ≥1 validada, el sort por `rank` de v0 se conserva a propósito (defecto O5, lo corrige 06).
- **`lib/server/audit/labels.ts`** (defensa en profundidad): razones con citas irresolubles o sin citas se retiran con warning; no-op en los flujos actuales.
- **`components/atlas/opportunity-drawer.tsx`**: estado de redacción visible junto a «Why here» (reusa estilo `.feed-down`; `globals.css` no se tocó).
- **Consumidores mínimos**: `lib/api/types.ts` (`narrative?` en el Opportunity legacy) y `lib/api/opportunity-adapter.ts` (passthrough).
- **Test nuevo `tests/acceptance/reasoning-support.test.ts`** (9 casos): grabación adversarial de 01 (inexistente/ajena/irrelevante con valores deseados de O4, incluida la proyección al adaptador), inyectadas (contradictoria, propuestas con cifras, sin citas, inyección en la descripción con todas rechazadas), fallos (503/JSON inválido/timeout con ranking y scores intactos) y auditoría de labels.

**Rojo/verde verificado**: test + contrato (tipos) primero → 9/9 en rojo sobre v0; con la corrección → 9/9 en verde.

**Desvío documentado**: `tests/acceptance/event-validity.test.ts` (ticket 04) aseguraba en su paso 2 que el defecto de 05 seguía vigente sobre la corrida actual; esa aserción estaba escrita para caducar con 05 y se actualizó al valor deseado del oráculo (paso 1 sobre la captura congelada y el `notDeepEqual` de citas quedaron intactos). Sin tocar harness ni `characterization.json`.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en las cinco sesiones del slice). Árbol sucio preexistente ajeno intacto.
- Cambios de esta sesión, sin commitear: `M frontend/lib/contracts/growxth.ts`, `M frontend/lib/server/reasoning/gemini.ts`, `M frontend/lib/server/audit/labels.ts`, `M frontend/components/atlas/opportunity-drawer.tsx`, `M frontend/lib/api/types.ts`, `M frontend/lib/api/opportunity-adapter.ts`; dentro de dirs sin trackear: `tests/acceptance/reasoning-support.test.ts` (nuevo), `tests/acceptance/event-validity.test.ts` (desvío O4.1 paso 2), ticket 05 (Status, criterios, Comments).
- Tests: `pnpm --dir frontend test` → **69 pass / 0 fail** (60 previos + 9 nuevos). `pnpm --dir frontend lint` → exit 0. `npx tsc --noEmit` → limpio.
- `pnpm --dir frontend test:baseline` (diagnóstico; drift esperado suma `gemini.ts` y `labels.ts`): **O1–O4 «corregido»**, O5 «defecto v0 vigente», sin INESPERADO. `characterization.json` y manifiesto sin re-grabar.
- Tickets: 01–05 en `ready-for-human`; 06–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 01–05 (el de 05 incluye el desvío en `event-validity.test.ts` y los consumidores extra `types.ts`/`opportunity-adapter.ts`) y commitear todo el slice (mensaje en español).
2. **Ticket 06** (orden solo determinístico, O5): requiere autorización explícita y pase a `ready-for-agent`. Mismo patrón: rojo con los predicados O5, corrección en `gemini.ts › reasonWithGemini` (quitar el sort por `rank` — la rama «ninguna validada» de 05 ya no ordena; falta la rama con validadas) y `opportunity-adapter.ts` (`rank: index + 1` sobre el orden recibido). Nota: `reasoning-support.test.ts` NO asegura el orden del caso con decisiones validadas (a propósito, para no chocar con 06); sí asegura orden determinístico en degradación y todas-rechazadas — esas aserciones deben seguir verdes tras 06.
3. **Tickets 07–15**: bloqueados hasta cerrar 06 y por las decisiones abiertas D1–D5 de `spec.md`.
4. Sigue abierta la decisión de promover el alias `@/` a un preload compartido (`node --import`); 05 lo esquivó igual que 02–04.

### Bloqueos y advertencias

- **Autorización por ticket**: 06 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent` antes de arrancar. Lista de archivos orientativa; cambios mínimos en contratos/consumidores permitidos y documentados.
- **Interdependencia 05↔06**: la rama «todas rechazadas» de `reasonWithGemini` ya devuelve el orden determinístico; al implementar 06 (quitar el sort de la rama con validadas) revisar que los warnings/narrative de 05 se conserven tal cual.
- **Guardia de cifras**: aplica SOLO al texto libre del modelo (titular/variantes); las plantillas determinísticas pueden llevar cifras. El titular del modelo puede nombrar la ciudad hipótesis (propuesta de acción, no afirmación de ubicación factual).
- **`narrative` ausente ≠ rechazada**: pipeline local sobre seeds y fixture no pasan por la etapa de redacción y no llevan `narrative`; solo `reasonWithGemini` emite el estado.
- Siguen vigentes: timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso, warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/05-explicaciones-con-soporte.md`, correr `pnpm --dir frontend test` para confirmar 69/69 en verde (y `test:baseline` para ver O1–O4 «corregido»), y esperar la autorización de Julian para el ticket 06 antes de escribir código.

---

## Session — 2026-09-08 03:35 UTC

### Resumen de la sesión

Se implementó el ticket **06 — Quitar al LLM la autoridad sobre el orden y los scores** (`.scratch/evaluacion-persistida/issues/06-orden-solo-deterministico.md`, oráculo O5), autorizado explícitamente por Julian (cubrió solo este ticket). El ticket quedó en `Status: ready-for-human` con `## Comments` completa (qué se hizo, rojo/verde, desvíos, salida real de tests). **No se hizo commit ni push**: los hace Julian. Con esto **cierra 01–06: los cinco oráculos quedan activos y verdes**, precondición de 07+.

Qué se corrigió (O5: el modelo devolvía `rank` invertido y v0 reordenaba el array; el adaptador emitía `rank: index + 1` sobre ese orden):

- **`lib/server/reasoning/gemini.ts`**: `rank` eliminado del contrato de salida útil (`RESPONSE_SCHEMA`: propiedad y `required`), de las instrucciones (fuera el bullet «rank: 1 = best market…»; el encabezado ahora dice que el orden ya lo decidió el scorer determinístico y no es del modelo) y del parseo (`GeminiDecision` sin `rank`; `parseDecisions` copia SOLO los campos del contrato — un `rank`/`score` devuelto es dato inesperado sin autoridad). Se eliminó el sort por rank de la rama con decisiones validadas: la redacción se aplica POR ID posición a posición y devuelve `reviewed` tal cual (repetidos: última gana sin duplicar, documentado; desconocidos: no crean oportunidad; omitidos: `deterministic_only`). Warnings/narrative de 05 intactos.
- **`lib/server/pipeline/global-market-search.ts`** y **`lib/server/pipeline/search-opportunities.ts`** — desempate determinístico documentado junto a cada sort: ante empate exacto del comparador v0 (mismo score o, en la rama de ubicación, misma distancia) decide el **id estable** de la oportunidad (comparación por puntos de código, ajena al locale). Antes el empate caía al orden de inserción (= orden de llegada de señales del proveedor / candidatos del grafo, vía sort estable). La política v0 no cambia (D2): el desempate solo actúa donde el comparador decía «iguales».
- **`lib/api/opportunity-adapter.ts`**: solo documentación sobre `rank: index + 1` (proyección del orden oficial; el adaptador no reordena ni introduce una segunda decisión). **`components/atlas/result-rail.tsx` sin cambios** (listado como probable): renderiza el array en orden con el rank del adaptador; el mapa consume el mismo array legacy.
- **Test nuevo `frontend/tests/acceptance/llm-rank-authority.test.ts`** (6 casos): (1) contrato/instrucciones sin `rank` — captura el cuerpo enviado al proveedor; decisión sin rank se aplica igual; (2) grabación adversarial de 01 (premisa verificada: rank exactamente inverso, candidato desconocido, campo `score: 99`) → O5.1/O5.2/O5.3 en valor deseado, proyección determinística completa posición a posición (ids, scores, breakdown, razones) y rank del adaptador = orden oficial; (3) inyectados repetidos/omitidos/desconocidos/con score + **segunda redacción** pidiendo el orden inverso (no modifica nada); (4) desempate del ranking mundial (Singapore/Tokyo con hubWeight idéntico y señal idéntica → empate real; orden de llegada invertido produce el mismo orden, resuelto por id); (5) desempate del pipeline local (grafo espejo, arrays en distinto orden); (6) ausencia de modelo (sin clave y proveedor caído): orden idéntico, `deterministic_only` declarado, proyección legacy completa comparada campo a campo (solo se normaliza `narrative`).

**Rojo/verde verificado**: el test se escribió primero y se corrió contra el código sin corregir → **5/6 en rojo** (contrato con rank; orden invertido por la grabación — «la ordenación por rank de la v0 congelada» que el ticket exige que falle; posiciones movidas por ranks inyectados; ambos empates volteados por el orden de llegada). El caso 6 ya estaba verde (la degradación la dejó bien 05, previsto). Con la corrección → **6/6 en verde**.

Decisiones no obvias:

- **El desempate vive en los sorts de los pipelines**, no en una etapa nueva: el defecto eran los comparadores que devolvían 0 y delegaban en el orden de inserción.
- **Cambio de comportamiento menor y deliberado**: donde v0 empataba exacto, el orden pasa de «orden de llegada» a «id estable». En la salida congelada no hay empates (84/82/75), así que nada existente se reordena; el único empate preexistente de la suite (fallback all-prepared del ranking mundial, tres ciudades en 40) se asevera por conjunto de países y sigue verde.
- **`reasoning-support.test.ts` (05) quedó intacto**: sus aserciones de orden en degradación/todas-rechazadas siguen verdes tras quitar el sort (interdependencia 05↔06 respetada); el caso con validadas no aseguraba orden a propósito y ahora lo asegura este ticket.
- Sin desvíos de alcance: los cuatro archivos tocados están en la lista del ticket, no se tocó ningún test previo ni el harness, y no se suma ninguna fuente nueva al drift (las cuatro ya lo tenían por 02–05).

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en las seis sesiones del slice). Árbol sucio preexistente ajeno intacto.
- Cambios de esta sesión, sin commitear: `M frontend/lib/server/reasoning/gemini.ts`, `M frontend/lib/server/pipeline/global-market-search.ts`, `M frontend/lib/server/pipeline/search-opportunities.ts`, `M frontend/lib/api/opportunity-adapter.ts` (todos ya con drift previo); dentro de dirs sin trackear: `tests/acceptance/llm-rank-authority.test.ts` (nuevo), ticket 06 (Status, criterios marcados, Comments).
- Tests: `pnpm --dir frontend test` → **75 pass / 0 fail** (69 previos + 6 nuevos). `pnpm --dir frontend lint` → exit 0. `npx tsc --noEmit` → limpio.
- `pnpm --dir frontend test:baseline` (diagnóstico; sin fuentes nuevas en drift): **O1–O5 «corregido»** (O1.3 y O5.13 «invariante»), sin INESPERADO. `characterization.json` y manifiesto sin re-grabar.
- Tickets: **01–06 en `ready-for-human`**; 07–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 01–06 (el de 06 incluye el cambio menor deliberado del desempate) y commitear todo el slice (mensaje en español).
2. **Tickets 07–15**: los cinco oráculos ya están activos y verdes (la precondición de 07 se cumplió); siguen bloqueados por las decisiones abiertas **D1–D5** de `spec.md` y cada uno necesita autorización explícita de Julian y pase a `ready-for-agent` antes de arrancar.
3. Sigue abierta la decisión de promover el alias `@/` a un preload compartido (`node --import`); 06 lo esquivó igual que 02–05 (promesa a nivel de módulo + imports relativos).

### Bloqueos y advertencias

- **Autorización por ticket**: 07 en adelante necesitan visto bueno explícito y `ready-for-agent`. Lista de archivos orientativa; cambios mínimos en contratos/consumidores permitidos y documentados; preguntar ante archivos de otra índole.
- **Desempate nuevo**: empates exactos de score/distancia se resuelven por id ascendente (puntos de código). Si un ticket futuro construye fixtures con scores empatados, ese es el orden esperado; no depender del orden de llegada.
- **Drift del manifiesto**: sin cambios en esta sesión (mismas ~13 fuentes); `baseline-v0.test.ts` sigue en modo diagnóstico y así debe seguir. No regenerar `characterization.json` ni `manifest.json`.
- Siguen vigentes: timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso (`failProviders` solo actúa sobre proveedores no cacheados — gemini no se cachea, por eso 05/06 pudieron usarlo), warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/06-orden-solo-deterministico.md`, correr `pnpm --dir frontend test` para confirmar 75/75 en verde y `test:baseline` para ver los cinco oráculos «corregido», y esperar las decisiones de Julian (commit del slice; D1–D5 y autorización de 07) antes de escribir código.

---

## Session — 2026-09-08 05:22 UTC

### Resumen de la sesión

Se implementó el ticket **07 — Definir y validar los contratos del recorrido persistido** (`.scratch/evaluacion-persistida/issues/07-contratos-versionados.md`), autorizado explícitamente por Julian (cubrió solo este ticket; su precondición —oráculos O1–O5 activos y verdes por 01–06— ya estaba cumplida). El ticket quedó en `Status: ready-for-human` con `## Comments` completa (qué se hizo, tests con salida real, desvíos). **No se hizo commit ni push**: los hace Julian.

Qué se construyó (solo los archivos que nombra el ticket + el test nuevo; `package.json` intacto):

- **`frontend/lib/contracts/evaluation.ts` (nuevo, SOLO tipos, misma regla que growxth.ts):** contratos versionados —`contractVersion: '1'` en todo payload persistible— de perfil, fuente/claim/revisión, organizador/edición/empresa/participación (identidades separadas del foco SF), snapshot, decisión y borrador de campaña, más `EvaluationReadBundle` y la proyección `EvaluationReadProjection`. La incertidumbre es estructural: `BudgetDeclaration` (unknown ≠ 0, moneda explícita), `DeclaredDate` (instant/date_only/ambiguous/unknown), `MoneyClaim` (quoted/estimated/unknown), `PolicyRef: none` ≠ score cero (D2), `SnapshotOutcome` (`no_eligible_candidates` ≠ `technical_failure`), `SnapshotOrdering` (`ranked` solo con política; si no, `presentation_only`), `ObjectiveDeclaration` (provisional/confirmado, éxito pendiente sin default — D1). La campaña NO tiene campos de costo total ni ROI (la ausencia es el contrato) y no hay tipos de ingestión de outcomes. Sin campos opcionales: todo presente con `null` explícito, para lectura fiel desde PostgreSQL. Reutiliza `NarrativeState` (05) como estado de redacción del snapshot.
- **`frontend/lib/contracts/evaluation-validation.ts` (nuevo):** validación de runtime con combinadores propios (~150 líneas; el ticket permitía una dependencia, no hizo falta). `parse<Contrato>()` por agregado + `parseEvaluationReadBundle`. La versión se comprueba ANTES que la forma (versión desconocida → un único error propio; jamás se lee como v1); las claves que v1 no define se RECHAZAN. Reglas de coherencia interna: `contradicted` exige motivo; estados afirmativos exigen fuentes; `inferred` exige método; valor `pending` no lleva estado afirmativo; alias `confirmed` exige soporte; coordenadas exigen alcance urbano; `paid_sponsor` no se infiere; `logo_present` sin resultado comercial; el snapshot no puntúa sin política y su orden ordena exactamente sus alternativas; compromiso `agreed` exige método + evidencia (estimación/meta no llevan confirmación); decisión con motivos, autor `server_session` y relación de revisión coherente.
- **`frontend/lib/api/opportunity-adapter.ts`:** sección nueva `projectEvaluationRead(bundle)` — proyección para dashboard, lista de organizadores, dossier, campaña y mapa local secundario. `ProjectedField` (known/ambiguous/pending con estado de claim, alcance, obtención y «qué falta confirmar») reemplaza los defaults engañosos del legacy: fecha desconocida queda `pending` sin display (jamás hoy), día sin zona queda `ambiguous`, alcance país muestra el país con «ciudad pendiente» y NO genera punto en el mapa (`listedWithoutPoint` con motivo), score sin política llega `no_policy` sin número, presupuesto desconocido `pending` sin 0. La lista de organizadores separa aliases confirmados de propuestos y no expone reputación.
- **`frontend/lib/contracts/growxth.ts` y `frontend/lib/api/types.ts`:** solo notas de frontera (documentación): growxth sigue siendo la frontera v0; los obligatorios engañosos del legacy (`city`, `score`, `startsAt`) quedan confinados a la vista v0.
- **Test nuevo `frontend/tests/contracts/evaluation.test.ts` (14 casos):** todos los del ticket — payload válido, inválidos con ruta/motivo (incluye `totalCostUsd`/`roi`/`reputationScore` como claves rechazadas), versión desconocida ('2' y ausente), fecha incierta, costo incompleto, país, contradicción, score ausente + outcomes distinguidos, compromiso sin soporte, identidades/aliases/logo, decisión, integridad relacional fuera de alcance (fuente irresoluble = objeto válido; proyección sin `obtainedAt` fabricado), round-trip por JSON y proyección de pendientes (con éxito pendiente, 'adoption' no aparece en toda la lectura).

Decisiones de diseño no obvias:

- **Patrón de revisión uniforme** (claim/organizador/edición/participación: id de revisión + identidad estable + `previousRevisionId`): lo pide el criterio SF («el snapshot incluye revisiones de organizador/relaciones») y simplifica 08/09.
- **Claves desconocidas se rechazan**, coherente con «versión desconocida no se interpreta como la actual»: cualquier campo nuevo exige editar el contrato v1 (antes de persistir datos reales) o subir de versión.
- **Convención de atributos de claims** que la proyección conoce: `access`, `audience`, `cost:<partida>`; el resto va a `otherClaims` del dossier.
- La proyección asume bundle validado y NO resuelve referencias: una revisión no incluida en la lectura se proyecta como pendiente honesto, nunca como valor inventado.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en las siete sesiones del slice). Árbol sucio preexistente ajeno intacto.
- Cambios de esta sesión, sin commitear: `?? frontend/lib/contracts/evaluation.ts`, `?? frontend/lib/contracts/evaluation-validation.ts`, `M frontend/lib/api/opportunity-adapter.ts` (proyección; ya con drift previo), `M frontend/lib/contracts/growxth.ts` y `M frontend/lib/api/types.ts` (solo notas de frontera); dentro de dirs sin trackear: `tests/contracts/evaluation.test.ts` (nuevo, dir nuevo) y el ticket 07 (Status, criterios marcados, Comments).
- Tests: `pnpm --dir frontend test` → **89 pass / 0 fail** (75 previos + 14 nuevos). `pnpm --dir frontend lint` → exit 0. `npx tsc --noEmit` → limpio.
- `pnpm --dir frontend test:baseline` (diagnóstico) → 8/8, **O1–O5 «corregido»**, sin INESPERADO (07 no toca el pipeline; sin fuentes nuevas en drift más allá de las notas en growxth/types). `characterization.json` y manifiesto sin re-grabar.
- Tickets: **01–07 en `ready-for-human`**; 08–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 01–07 (el de 07 incluye el detalle de contratos, reglas y decisiones) y commitear todo el slice (mensaje en español).
2. **Decisiones abiertas D1–D5** de `spec.md`: siguen abiertas; 07 las representa explícitamente (D1: objetivo provisional + éxito pendiente; D2: `policy: none`) pero 08+ (persistencia real, transacciones, worker) las necesita para cerrar con datos reales.
3. **Ticket 08** (siguiente del slice): requiere autorización explícita y pase a `ready-for-agent`. Debe usar los `parse*` de `evaluation-validation.ts` en escritura/lectura/jobs y agregar ahí la integridad relacional (tenant, referencias existentes) que 07 dejó explícitamente fuera.
4. Sigue abierta la decisión de promover el alias `@/` a un preload compartido (`node --import`); 07 lo esquivó igual que 02–06 (imports relativos con extensión `.ts`).

### Bloqueos y advertencias

- **Autorización por ticket**: 08 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent`. Lista de archivos orientativa; cambios mínimos en contratos/consumidores permitidos y documentados; preguntar ante archivos de otra índole.
- **Contratos estrictos**: los validadores rechazan claves desconocidas y versión ≠ '1'. Quien agregue campos en 08+ debe editar contrato + validador + test juntos; no hay «campos extra tolerados».
- **Reglas de objeto vs. relacionales**: `evaluation-validation.ts` NO comprueba existencia de ids ni tenant (a propósito, criterio del ticket); no dar por «probada» la integridad con estos parsers — es trabajo de 08/09 contra PostgreSQL real.
- Siguen vigentes: timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso, warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, desempate por id estable en empates exactos (06), y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/07-contratos-versionados.md`, correr `pnpm --dir frontend test` para confirmar 89/89 en verde (y `test:baseline` para ver O1–O5 «corregido» sin INESPERADO), y esperar las decisiones de Julian (commit del slice; D1–D5 y autorización de 08) antes de escribir código.

---

## Session — 2026-09-08 06:03 UTC

### Resumen de la sesión

Se implementó el ticket **08 — Aceptar un perfil y recuperar su run desde PostgreSQL** (`.scratch/evaluacion-persistida/issues/08-primer-run-durable-y-tenant.md`), autorizado explícitamente por Julian (cubrió solo este ticket; su bloqueo por 07 ya estaba resuelto — ver la sesión anterior, 05:22 UTC). El ticket quedó en `Status: ready-for-human` con `## Comments` completa (qué se hizo, tests con salida real, desvíos). **No se hizo commit ni push**: los hace Julian.

Qué se construyó (el intake ahora crea un run durable autenticado que la UI recupera tras recargar):

- **Datos** — `frontend/db/migrations/001-evaluacion-persistida.sql` + runner idempotente `frontend/lib/server/db/migrate.ts` (`pnpm db:migrate`): esquema `growthx` con tenants/pertenencias, sesiones (hash de token), perfiles versionados (payload JSONB validado con los contratos de 07), runs (unique `(tenant_id, idempotency_key)` + `payload_hash`), run_steps y run_logs; referencias compuestas `(tenant_id, id)` contra enlaces cruzados. RLS `ENABLE` + `FORCE` con contexto por transacción (`set_config(..., is_local=true)`, se limpia solo al volver al pool — `lib/server/db/pool.ts`). Tres roles sin propietario/bypass: `growthx_app` (rutas + identidad), `growthx_worker` (negocio bajo RLS, sin sesiones), `growthx_queue` (dueño del esquema pgboss, **cero** grants de negocio).
- **Aceptación atómica** — `lib/server/evaluations/` (`wire.ts` parseo estricto — un `tenantId` en el cuerpo es 400 —, `service.ts`, `queue.ts`/`queue-config.ts`): pg-boss 12 acepta un `db` por llamada, así el INSERT del job corre DENTRO de la transacción que inserta perfil + run + steps. 202 ⇔ job durable, sin outbox. Idempotencia: misma clave+payload → mismo run; otro payload → 409. `singletonKey = runId`.
- **Worker** — `frontend/worker/index.ts` (`pnpm worker`), proceso Node separado: cola con `growthx_queue`, negocio con `growthx_worker` y el tenant del run resuelto por el servidor en el payload del job. Pasos con confirmación transaccional, reanudación (los completados no se repiten), reintentos con límite (retryLimit 3), errores y logs persistidos por run/step/intento. Primera ruta: investigación de catálogo sobre `fixture-catalog.ts` (material `prepared`, etiquetado; D4 pendiente). `GROWTHX_WORKER_EXIT_AFTER_STEP` = corte controlado para demo/test.
- **HTTP + sesión** — `app/api/evaluations/route.ts` y `[id]/route.ts` (imports relativos `.ts` para correr bajo `node --test`); `lib/server/auth/session.ts`: token opaco (cookie `growthx_session` o Bearer) hasheado en base, pertenencia revalidada — interinato mínimo de D3, no un header confiado. `lib/server/db/seed-dev.ts` (`pnpm db:seed-dev`) siembra tenant/usuario/sesión dev e imprime el token.
- **UI** — `onboarding-intake.tsx` suma audiencia, stack, presupuesto (vacío = desconocido explícito; `budgetUsd: 0` ya no se transmite siempre) y ventana de fechas; `atlas-shell.tsx` dispara el run durable ADEMÁS de la búsqueda v0, guarda `?run=` como enlace interno y una recarga con `?run=` recupera el run SIN relanzar la búsqueda; `analysis-overlay.tsx` muestra los pasos reales persistidos (en vista idle se eleva con estilo inline — `globals.css` intacto); `atlas-client.ts` suma `startEvaluation`/`fetchEvaluation`/`pollEvaluation` (outcomes tipados, nunca lanza).
- **Config** — `package.json`: deps `pg`/`pg-boss`/`@types/pg` y scripts `db:up`/`db:down`/`db:migrate`/`db:seed-dev`/`worker`; `env.ts`: las tres URLs nuevas como warn-only (modo degradado intacto: sin base, POST responde 503 tipado y el recorrido v0 sigue); `frontend/db/README.md` documenta todo (sin secretos en el repo).
- **Test** — `frontend/tests/integration/evaluation-run.test.ts` (13 casos, PostgreSQL y pg-boss REALES; sin base se salta con aviso): 401, tenantId rechazado, 202 con run+steps+job en el mismo commit, atomicidad (cola inyectada que falla → cero filas y cero jobs), duplicado, conflicto, señuelo por ruta y por SQL con RLS, rol de cola sin negocio, **reanudación con dos procesos worker reales** (corte tras `research_catalog`, reinicio, mismo run termina, el paso confirmado no se re-ejecuta), lectura tras cerrar el pool, 400/404.

Verificación de navegador (Playwright manual, no versionada): intake → 202 → `?run=` → recarga → overlay «Saved evaluation (recovered)» con pasos reales y candidatos, sin disparar `/api/opportunities/search` (interceptado); capturas revisadas.

Decisiones/desvíos no obvios (detallados en los Comments del ticket):

- Archivos nuevos fuera de la lista literal pero dentro de los dirs previstos: `frontend/db/README.md` y `lib/server/db/seed-dev.ts`. `.env.local` local (gitignoreado) quedó con las URLs del contenedor.
- La prueba de navegador NO quedó como test del repo (habría sumado Playwright como dependencia + archivo no listado); si se quiere versionada, va con la matriz de caídas del ticket 15.
- Atomicidad por la vía preferida de la spec (integración transaccional de pg-boss), no el outbox alternativo.
- El run durable convive con la búsqueda v0 (frontera de caracterización intacta); la reorganización del dashboard es del ticket 10.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en ninguna sesión del slice). Árbol sucio preexistente ajeno intacto (`next.config.mjs` y `next-env.d.ts` con diffs ajenos/autogenerados previos).
- Cambios de esta sesión, sin commitear: `M` `analysis-overlay.tsx`, `atlas-shell.tsx`, `onboarding-intake.tsx`, `lib/api/atlas-client.ts`, `lib/server/env.ts`, `package.json`, `pnpm-lock.yaml`; nuevos `frontend/db/` (migración + README), `frontend/lib/server/db/`, `frontend/lib/server/auth/`, `frontend/lib/server/evaluations/`, `frontend/app/api/evaluations/`, `frontend/worker/`, `frontend/tests/integration/`; ticket 08 (Status, criterios, Comments).
- Tests: `pnpm --dir frontend test` → **102 pass / 0 fail** (89 previos + 13 nuevos, ~5 s con la base arriba). `pnpm --dir frontend lint` → exit 0. `npx tsc --noEmit` → limpio. `pnpm --dir frontend build` → OK. `test:baseline` → 8/8, O1–O5 «corregido», sin INESPERADO.
- Infra local YA montada en esta máquina: contenedor Docker `growthx-postgres` (postgres:17-alpine, 127.0.0.1:54329) corriendo, migrado y con tenant dev sembrado; `frontend/.env.local` con las cuatro `GROWTHX_*_DATABASE_URL`. Sin la base, la suite de integración se salta con aviso (también quedó en la memoria del proyecto: `infra-local-ticket-08`).
- Tickets: **01–08 en `ready-for-human`**; 09–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 07 y 08 (el de 08 incluye los desvíos: README/seed-dev como archivos nuevos, prueba de navegador manual, interinato de sesión por D3) y commitear todo el slice (mensaje en español). `pnpm-lock.yaml` cambió por las deps nuevas.
2. **Julian**: decidir si la prueba de navegador del intake se versiona (sumar Playwright como dependencia) ahora o junto con la matriz de caídas del ticket 15.
3. **Ticket 09** (siguiente del slice): requiere autorización explícita y pase a `ready-for-agent`. Sigue condicionado por las decisiones abiertas D1–D5 de `spec.md` (08 dejó D3 con interinato de token opaco y D5 sin resolver: todo corre local).
4. Sigue abierta la decisión de promover el alias `@/` a un preload compartido; 08 lo esquivó con imports relativos `.ts` en todos los módulos nuevos (rutas incluidas).

### Bloqueos y advertencias

- **Autorización por ticket**: 09 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent`. Lista de archivos orientativa, pero esta sesión Julian pidió alcance estricto («solo los archivos que el ticket nombra; preguntar antes de tocar otro») — confirmar el criterio por ticket.
- **Base para tests**: `evaluation-run.test.ts` necesita el contenedor arriba (`pnpm db:up && pnpm db:migrate`); apagado, la suite se salta con aviso (no falla). El token dev impreso por `db:seed-dev` no se persiste en el repo.
- **D3/D5 siguen abiertas**: la sesión por token opaco es un interinato documentado (no habilita demo compartida ni datos reales); PostgreSQL y worker corren solo local.
- **Roles y grants**: las contraseñas de `growthx_app/worker/queue` tienen defaults SOLO para el contenedor local; en cualquier entorno compartido se pasan por env antes de migrar (`GROWTHX_*_DB_PASSWORD`). El rol de cola no puede leer negocio (test lo asegura); no «arreglar» un permission denied de `growthx_queue` con grants.
- Siguen vigentes: drift esperado del manifiesto v0 (baseline en modo diagnóstico; no regenerar `characterization.json`/`manifest.json`), timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso, warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/08-primer-run-durable-y-tenant.md`, verificar `docker ps | grep growthx-postgres` (si no está: `pnpm --dir frontend db:up && pnpm --dir frontend db:migrate`), correr `pnpm --dir frontend test` para confirmar 102/102 en verde, y esperar las decisiones de Julian (commit del slice; autorización de 09 y D1–D5) antes de escribir código.

---

## Session — 2026-09-08 07:16 UTC

### Resumen de la sesión

Se implementó el ticket **09 — Persistir dossiers de organizadores y eventos curados de SF** (`.scratch/evaluacion-persistida/issues/09-dossier-catalogo-curado.md`), autorizado explícitamente por Julian (cubrió solo este ticket; su bloqueo por 08 ya estaba resuelto). El ticket quedó en `Status: ready-for-human` con `## Comments` completa (qué se hizo, tests con salida real, desvíos). **No se hizo commit ni push**: los hace Julian.

Qué se construyó:

- **Migración `frontend/db/migrations/002-catalogo-curado.sql`**: catálogo materializado BAJO el tenant — `catalog_loads` (procedencia: manifiesto, hash, responsable, fecha de verificación, etiqueta `material` synthetic/curated), `sources`/`companies` (inmutables), `organizers`/`event_editions`/`participations`/`claims` (identidades) + tablas `*_revisions` encadenadas por `previous_revision_id` (cadena lineal por `unique nulls not distinct`; correcciones = revisiones nuevas, nada se actualiza ni borra). RLS enable+force en las 12 tablas; referencias compuestas `(tenant_id, id)` en todas las relaciones, incluida `claim_revision_sources` (un claim no puede citar fuentes de otro tenant ni con RLS apagada — probado como admin). Grants mínimos: app select+insert (update solo de `catalog_loads.summary`); worker solo select.
- **`lib/server/evidence/store.ts`** (dir nuevo): upsert inmutable de fuentes, upsert de revisiones de claims con sujeto/fuentes/cadena verificados DENTRO del tenant (vía RLS), lectura de claims por sujeto con cadena completa, `orderRevisionChain` compartido.
- **`lib/server/catalog/`** (dir nuevo): `manifest.ts` (parseo ESTRICTO: claves desconocidas rechazadas, versión antes que forma, entidades con los parsers de 07, responsable/fecha/etiqueta obligatorios, extractos ≤600 chars, hash canónico); `store.ts` (`loadCuratedCatalog`: UNA transacción por manifiesto, idempotente por hash Y por entidad — mismo id+otro payload = rechazo con rollback); `read.ts` (lecturas de PostgreSQL con revalidación de contratos al leer, vigencia con instante inyectable sobre la política de 04, lista con pendientes por atributo, dossier de edición y expediente de organizador con cadenas completas); `research.ts` (research del worker sobre el catálogo persistido: matching estructurado stack↔claims `focus`, razones por atributo, vencidos contados, límite declarado; null si el tenant nunca cargó catálogo); `fixture-manifest.ts` (manifiesto SINTÉTICO etiquetado que ejercita todos los criterios: 2 organizadores comparables con antecedente c/u, homónimos, coorganizador, contradicción de audiencia entre 2 fuentes, costo/acceso pendientes, antecedente en Berlín, paid_sponsor reportado con outcome desconocido, logo_present, edición con alcance solo país).
- **Rutas nuevas** (sesión + RLS, 404 sin confirmar existencia ajena, sin consultar fuentes al abrir): `app/api/organizers/[id]/route.ts` (prevista por el ticket), `app/api/catalog/editions/route.ts` y `app/api/catalog/editions/[id]/route.ts` (autorizadas en sesión).
- **`lib/api/atlas-client.ts`**: tipos espejo de la frontera nueva + `fetchCatalogEditions`/`fetchEditionDossier`/`fetchOrganizerDossier` (outcomes tipados, nunca lanzan). **`lib/api/opportunity-adapter.ts`**: `projectEditionDossierView` / `projectOrganizerDossierView` — cada valor material con fuente/localizador, obtención vs publicación, estado, método, alcance, cadena de revisiones (contradicción muestra AMBAS con sus fuentes) y pregunta concreta por faltante; sin score de reputación.
- **UI**: `components/atlas/catalog-dossier-panel.tsx` (nuevo) — control mínimo de catálogo + dossier + expediente dentro del overlay del run recuperado (`?run=`); `analysis-overlay.tsx` lo monta y actualiza el label del paso research; `evidence-links.tsx` suma `SourceRecordLinks` para fuentes persistidas (SourceRecord de 07).
- **`lib/server/evaluations/run-worker.ts`**: `research_catalog` investiga el catálogo PERSISTIDO del tenant; catálogo sin opciones vigentes → límite declarado, sin seeds; SOLO un tenant sin carga alguna cae al fixture de 08 («sin catálogo» ≠ «sin opciones vigentes»).
- **`scripts/load-curated-catalog.ts`**: única vía de entrada del catálogo (`--manifest <ruta.json> | --fixture`, `--tenant <slug>`), rol growthx_app bajo RLS, avisos de cobertura (2–5 vigentes; ≥2 organizadores con antecedente) sin fabricar nada.
- **Test `frontend/tests/integration/curated-dossier.test.ts`** (18 casos, PostgreSQL real; sin base se salta con aviso): parseo estricto, carga completa, recarga idempotente, fuente replicada + conflicto inmutable con rollback, corrección revisionada, 401/400, lista con vigencia/pendientes, dossier con contradicción/costo pendiente/fuentes + proyección, homónimos e independencia (coorganizador sin herencia; insuficiencia declarada; Berlín conserva geografía), participaciones (empresa→edición→fuente; logo_present sin promoción; outcome desconocido ≠ fracaso), research persistido (rol worker real; null sin catálogo; límite en T3), tenant señuelo (rutas, RLS, carga cruzada rechazada, FK compuesta violada como admin), reloj controlado (upcoming→past sin re-curar; catálogo vencido declarado sin seeds).

Desvíos y decisiones (todos en los Comments del ticket):

- **Alcance por archivos**: Julian pidió esta vez alcance estricto («solo los archivos que el ticket nombra; si necesitás otro, pará y preguntá»). Se preguntó DOS veces por AskUserQuestion: (1) rutas `/api/catalog/*` nuevas + montaje en `analysis-overlay` + componente nuevo + `atlas-client` + **migrar el worker al catálogo persistido** (elección de Julian, no la recomendada); (2) `lib/server/db/migrate.ts` para un fix puntual: con DOS suites de integración en paralelo, los `ALTER ROLE` concurrentes de `ensureRoles` chocaban intermitentemente («tuple concurrently updated», XX000) — se agregó un advisory lock de sesión en `runMigrations` y la suite se corrió 3 veces seguidas en verde.
- **Listados como probables y NO tocados**: `opportunity-drawer.tsx` (el dossier vive en el panel del run recuperado; el drawer no monta en ese estado), `result-rail.tsx`, `world-map.tsx` (siguen siendo la vista v0; las ediciones curadas no generan puntos sin respaldo urbano y el dossier no depende del mapa; la reorganización es del ticket 10).
- **Criterios 1–2 («catálogo real»)**: cumplidos a nivel MECANISMO con material sintético etiquetado, como prescribe el propio ticket; el cierre real sigue bloqueado por D4 (el valor `material: 'curated'` queda reservado en el esquema).
- **«Serie»** no se modeló como entidad (los contratos de 07 están cerrados y no la definen); puede documentarse como claim de edición. Si 10+ la necesita como entidad, es cambio de contrato explícito.
- **Prueba de navegador** manual con Playwright (no versionada, misma decisión que 08; si se versiona va con la matriz del ticket 15): abrir `/?run=<id>` → catálogo → dossier del Summit (contradicción con ambas revisiones y 2 fuentes, costo pendiente con pregunta, href del listado abrible, obtención/método/alcance) → expediente del organizador (antecedente Berlín, paid_sponsor·reported, outcome no publicado ≠ fracaso) → recarga → mismos claims. 16/16 checks; capturas revisadas.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en ninguna sesión del slice). Árbol sucio preexistente ajeno intacto (~120 rutas en total).
- Cambios de esta sesión, sin commitear: `M frontend/components/atlas/analysis-overlay.tsx`, `M frontend/components/atlas/evidence-links.tsx`, `M frontend/lib/api/atlas-client.ts`, `M frontend/lib/api/opportunity-adapter.ts`; nuevos `frontend/app/api/catalog/`, `frontend/app/api/organizers/`, `frontend/components/atlas/catalog-dossier-panel.tsx`, `frontend/lib/server/catalog/`, `frontend/lib/server/evidence/`, `frontend/scripts/load-curated-catalog.ts`; dentro de dirs sin trackear de 08: `db/migrations/002-catalogo-curado.sql` (nuevo), `lib/server/evaluations/run-worker.ts` (editado), `lib/server/db/migrate.ts` (editado — advisory lock), `tests/integration/curated-dossier.test.ts` (nuevo), ticket 09 (Status, criterios marcados, Comments).
- Tests: `pnpm --dir frontend test` → **120 pass / 0 fail** (102 previos + 18 nuevos; corrido 3 veces seguidas en verde tras el fix de la carrera). `pnpm --dir frontend lint` → exit 0. `npx tsc --noEmit` → limpio. `pnpm build` → OK (rutas `/api/catalog/editions`, `/api/catalog/editions/[id]`, `/api/organizers/[id]` presentes). `test:baseline` → 8/8, O1–O5 «corregido», sin INESPERADO.
- Infra local: contenedor `growthx-postgres` migrado con 002; catálogo fixture sintético cargado bajo `growthx-dev` y un run de demo completado (`?run=e45a1ffc-…`) — por eso `research_catalog` de growthx-dev ya investiga el catálogo persistido (también en la memoria del proyecto: `infra-local-ticket-08`).
- Tickets: **01–09 en `ready-for-human`**; 10–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 09 (incluyen los desvíos autorizados: rutas `/api/catalog/*`, overlay + panel nuevo, atlas-client, worker migrado al catálogo persistido, advisory lock en migrate.ts) y commitear todo el slice (mensaje en español).
2. **Ticket 10** (dashboard de descubrimiento): requiere autorización explícita y pase a `ready-for-agent`. 09 le deja listos: lecturas de catálogo/dossier/organizador por HTTP, proyecciones en el adaptador, y el research del worker sobre el catálogo persistido. La reorganización de la entrada (navegación lateral, mapa secundario) es suya.
3. **Decisiones abiertas D1–D5**: D4 sigue siendo la más urgente para 09 (cerrar el catálogo real: URLs verificadas, responsable, material conservable → cargar un manifiesto `material: 'curated'` con el mismo script); D3/D5 bloquean demo compartida y operación.
4. Sigue abierta la decisión de promover el alias `@/` a un preload compartido; 09 lo esquivó igual que 02–08 (imports relativos `.ts` en todos los módulos nuevos).

### Bloqueos y advertencias

- **Autorización por ticket**: 10 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent`. En esta sesión el criterio fue alcance ESTRICTO por archivos con pregunta previa (AskUserQuestion) — confirmar el criterio por ticket.
- **Catálogo curado = única entrada**: no agregar conectores ni ingesta; el catálogo entra SOLO por `scripts/load-curated-catalog.ts` con manifiesto autorizado. Fuentes/empresas/revisiones son INMUTABLES: recargar un id con otro contenido rechaza la carga entera; una corrección es una revisión nueva encadenada.
- **Fallback del fixture de 08**: solo para tenants sin NINGUNA carga de catálogo (así `evaluation-run.test.ts` sigue verde sin tocarlo). No «arreglar» un catálogo vacío haciéndolo caer al fixture: «sin opciones vigentes» se declara.
- **Vigencia**: `ed-ml-night-2026` del fixture (2026-10-01, día sin zona) vence ~2026-10-02 en reloj real — está elegido a propósito para el test de reloj controlado; los asserts atados a fecha usan instantes controlados (T1/T2/T3), no `now()`. El Summit (2027-03-10) y el Roadshow (2027-05-01) vencen en 2027.
- **Grants nuevos**: el worker solo LEE el catálogo; growthx_app no tiene UPDATE/DELETE de catálogo (salvo `catalog_loads.summary`). No «arreglar» un permission denied con grants: es el diseño.
- **Migraciones concurrentes**: `runMigrations` ahora toma `pg_advisory_lock(hashtext('growthx.migrations'))` por sesión; si un proceso queda colgado en migración, el siguiente espera el lock (no falla).
- Siguen vigentes: drift esperado del manifiesto v0 (baseline en modo diagnóstico; no regenerar `characterization.json`/`manifest.json`), timers de 4,5 s, caches por término globales del proceso, warnings `MODULE_TYPELESS_PACKAGE_JSON`, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/09-dossier-catalogo-curado.md`, verificar `docker ps | grep growthx-postgres` (si no está: `pnpm --dir frontend db:up && pnpm --dir frontend db:migrate`), correr `pnpm --dir frontend test` para confirmar 120/120 en verde, y esperar las decisiones de Julian (commit del slice; autorización de 10 y D1–D5) antes de escribir código. Para ver la demo: `pnpm dev` + cookie de sesión dev + `/?run=e45a1ffc-5f37-4b0c-a6e6-6f17240b7744` (o sembrar un run nuevo con intake + `pnpm worker`).


## Session — 2026-09-08 21:36 UTC

### Cierre del ticket 10 y handoff

El ticket [10 — Dashboard SF y organizadores](../.scratch/evaluacion-persistida/issues/10-dashboard-sf-y-organizadores.md) quedó `Status: ready-for-human`. Su sección `## Comments` es la referencia canónica para cambios, criterios verificados, ampliaciones de alcance autorizadas, límites y salidas reales completas de las pruebas. La verificación final está en verde; no se hizo commit ni push.

Esta entrada actualiza el estado de la sesión anterior: **01–10 están `ready-for-human`; 11–15 siguen `needs-triage`**. La autorización recibida cubre 10, no los tickets siguientes. Último estado observado: `main`, HEAD `480712c`, con árbol sucio preexistente y cambios del slice sin commitear; conservarlos.

La siguiente acción es la revisión humana de 10. Para implementar [11 — Luma a dossier durable](../.scratch/evaluacion-persistida/issues/11-luma-a-dossier-durable.md), primero hace falta autorización explícita y lectura completa del ticket. Se mantiene la restricción de preguntar antes de editar archivos fuera del alcance autorizado. Los límites de catálogo real y decisiones abiertas siguen documentados en el ticket y la especificación.

Por solicitud posterior del usuario se aplicó `.agents/skills/handoff/SKILL.md`: el resumen de continuidad se guardó en `/private/var/folders/sn/h7vh5zv940nbqdg9vwd2qtgm0000gn/T/growthx-handoff-ac9mulbr/ticket-10.md`. Se tomó este plan como documento de destino, preservando todas sus entradas anteriores. Esta actualización es solo documental: no cambió código ni volvió a ejecutar pruebas. La afirmación del ticket de que este plan no se editó corresponde al cierre previo de la implementación.

### Suggested skills

Invocar `code-review` si se solicita revisar 10; `diagnosing-bugs` si aparece un fallo concreto; `handoff` para cerrar la próxima sesión. Leer sus respectivos `SKILL.md` en `.agents/skills/` antes de usarlos. El ticket conserva los detalles necesarios aunque el archivo temporal deje de estar disponible.

---

## Session — 2026-09-09 01:33 UTC

### Resumen de la sesión

Se implementó el ticket **11 — Convertir una URL de Luma en un dossier durable** (`.scratch/evaluacion-persistida/issues/11-luma-a-dossier-durable.md`), autorizado explícitamente por Julian (cubrió solo este ticket). El ticket quedó en `Status: ready-for-human` con los 7 criterios marcados y `## Comments` completa (qué se hizo, tests con salida real, desvíos autorizados, límites). **No se hizo commit ni push**: los hace Julian.

Qué se construyó:

- **Ruta asíncrona**: `POST /api/events/ingest` ya no obtiene la página — valida sesión y URL (https, allowlist lu.ma/luma.com, sin credenciales/puertos, canonicalización a `https://lu.ma/<ruta>`) y delega en `startEvaluation` (`acceptEventIngest` nuevo en `service.ts`) → **202 con runId**; 409/400/401/503 tipados. El cliente cambió junto (`startEventIngest` + `eventIngestResult` en `atlas-client.ts`; `ingestEvent` eliminado). No quedan dos motores de importación.
- **Aceptación durable**: run `mode: 'event_evaluation'` (ya admitido por el esquema 001), workflow `luma-ingest/1`, 4 steps + job pg-boss en una transacción; idempotencia por (tenant, clave) con hash sobre la URL canónica (dos aliases con la misma clave = el MISMO run). **El run reutiliza el perfil de una investigación existente** (`profileRunId`, elección de Julian vía AskUserQuestion): la importación no fabrica producto/audiencia/objetivo; sin investigación previa la UI pide completar el perfil primero.
- **Worker**: steps nuevos `fetch_event_page` (obtención con `redirect: 'manual'` validando cada destino, límite 2 MB por streaming, timeout 10 s, máx. 3 redirecciones; **reutiliza `parseLumaEvent` de `lib/api/luma.ts` sin cambios**; salida sin HTML completo — campos saneados + sha256) y `persist_dossier` (`lib/server/catalog/luma-adapter.ts` nuevo: UNA transacción bajo el tenant — carga `material: 'imported'`, fuente inmutable con hash, revisión de edición encadenada, claims por atributo `announced` con método `jsonld_extraction` y fuente; ausentes → claims `pending` con nota solo si no existía conocimiento del atributo). Ids deterministas por run → reentrega idempotente.
- **Identidad (arista 09→11)**: coincidencia de URL canónica/aliases → nueva revisión sobre la MISMA identidad (lo no publicado por la página NO entierra valores curados previos, p. ej. la ciudad); sin coincidencia → identidad `luma-<slug>` (colisión → sufijo, nunca fusión). Reutiliza el repositorio de 09 (`upsertSources`/`upsertClaimRevisions`/`upsertEditionRevisions`, este último ahora exportado).
- **Migración `004-importacion-luma.sql`**: etiqueta `'imported'` en `catalog_loads.material` + grants INSERT de `growthx_worker` SOLO sobre lo que la importación escribe (sources/ediciones/claims/loads). El worker sigue sin escribir empresas/organizadores/participaciones: el organizador queda como claim, no como identidad.
- **UI**: `event-import.tsx` reescrito (runId, URL solicitada, pasos persistidos con intentos, error con causa, aviso de dossier parcial, botón «Abrir dossier persistido» → panel de 09 vía `/api/catalog/editions/:id`); `research-dashboard.tsx` cablea la operación durable con clave idempotente conservada en reintentos, `openRun` (recarga con `?run=` recupera), refresh del catálogo al completar y nota de material importado; `opportunity-adapter.ts` con la nota visible del material.
- **Test `frontend/tests/integration/luma-dossier.test.ts`** (12 subtests, PostgreSQL + pg-boss reales, transporte HTML controlado inyectado al worker): 401, URL inválida (esquema/credenciales/puerto/host/ruta) sin crear run, profileRunId ajeno → 400 por RLS, HTML completo → dossier con claims, duplicado (mismo run, count=1, conflicto 409), HTML parcial → pendientes explícitos sin fallback a seeds, redirecciones dentro/fuera de allowlist, límite de tamaño, timeout, prompt injection (texto inerte: no aparece en NINGUNA tabla persistida; no se sigue ninguna URL del HTML), identidad existente + reimportación (revisiones encadenadas, una sola identidad), reanudación idempotente.

Verificación: `pnpm --dir frontend test` → **133 pass / 0 fail** (120 previos + 13 nuevos) + **11 pass** e2e, exit 0. `pnpm --dir frontend lint` → exit 0 sin warnings. `npx tsc --noEmit` limpio. `pnpm build` OK. `test:baseline` → 8/8, O1–O5 «corregido», sin INESPERADO. Demostración de navegador manual (Playwright, no versionada, misma decisión que 08/09): pegar URL → 202 + pasos pendientes → cierre del navegador durante la obtención → worker con transporte controlado → navegador nuevo en `/?run=` recupera el run completado → dossier desde PostgreSQL con pendientes y etiqueta de material importado; idempotencia por HTTP verificada. **No se consultó ninguna URL real de Luma** (D4 abierta; el smoke real se registra aparte).

Decisiones y hallazgos no obvios:

- **Alcance**: Julian autorizó vía AskUserQuestion los archivos fuera de la lista del ticket (wire/service/run-worker, research-dashboard, migración 004, y cambios mínimos en catalog/store.ts, catalog/manifest.ts y opportunity-adapter.ts) y la opción `profileRunId` para el perfil. `lib/api/luma.ts` y `atlas-shell.tsx` (listados como probables) quedaron sin cambios: el parser se reutiliza tal cual y el shell es solo un wrapper desde el ticket 10.
- **Higiene de la cola pg-boss (incidente resuelto)**: los tests de integración dejan jobs `created` en la cola compartida; los huérfanos de corridas previas hacían que el worker real de `evaluation-run.test.ts` los levantara primero (¡y un job de importación huérfano saldría a la red real!) y rompían su subtest de reanudación. `luma-dossier.test.ts` ahora cancela sus propios jobs (tenants `luma-%`) al inicio y tras cada aceptación; se limpiaron por única vez, vía SQL en el contenedor, los huérfanos históricos (incluidos 3 de tenants `it-real-*` dejados por las corridas fallidas intermedias). Documentado también en la memoria del proyecto (`infra-local-ticket-08`).

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en ninguna sesión del slice). Árbol sucio preexistente ajeno intacto (~124 rutas en total).
- Cambios de esta sesión, sin commitear: `M frontend/app/api/events/ingest/route.ts`, `M frontend/lib/api/types.ts`, `M frontend/lib/api/atlas-client.ts`, `M frontend/lib/api/opportunity-adapter.ts`, `M frontend/components/atlas/event-import.tsx`, `M frontend/components/research-dashboard/research-dashboard.tsx`, `M frontend/lib/server/evaluations/wire.ts`, `M frontend/lib/server/evaluations/service.ts`, `M frontend/lib/server/evaluations/run-worker.ts`, `M frontend/lib/server/catalog/store.ts`, `M frontend/lib/server/catalog/manifest.ts`; nuevos `frontend/lib/server/catalog/luma-adapter.ts`, `frontend/lib/server/evaluations/luma-step.ts`, `frontend/db/migrations/004-importacion-luma.sql`, `frontend/tests/integration/luma-dossier.test.ts`; ticket 11 (Status, criterios, Comments).
- Infra local: migración 004 YA aplicada al contenedor `growthx-postgres`; cola pg-boss sin jobs huérfanos; quedó un tenant `luma-browser-check` con los datos del check de navegador (inocuo, borrable).
- Tickets: **01–11 en `ready-for-human`**; 12–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 11 (incluyen los desvíos autorizados y los límites conocidos: el historial del Resumen sigue listando solo runs `sf-organizers/1` — el run de importación se recupera por `?run=` —, el copy «Verificado … por <uuid>» para cargas importadas, y `endsAt`/sponsors no persistidos) y commitear todo el slice (mensaje en español).
2. **Decisión abierta D4**: para el cierre real de 11 falta la URL real de SF con permiso/base de uso documentada y el smoke manual registrado aparte (el mecanismo ya está probado con transporte controlado).
3. **Tickets 12–15**: requieren autorización explícita de Julian y pase a `ready-for-agent`, además de las decisiones abiertas D1–D5 de `spec.md`. 11 les deja listos la importación durable, el resultado `luma_event_ingest` y el dossier importado en el catálogo del tenant.
4. Sigue abierta la decisión de promover el alias `@/` a un preload compartido; 11 lo esquivó igual que 02–10 (imports relativos `.ts`).

### Bloqueos y advertencias

- **Autorización por ticket**: 12 en adelante necesitan visto bueno explícito y `ready-for-agent`. Esta sesión el criterio fue alcance estricto con pregunta previa (AskUserQuestion, dos preguntas: conjunto de archivos + origen del perfil) — confirmar el criterio por ticket.
- **Cola pg-boss compartida en tests**: si `evaluation-run.test.ts` vuelve a fallar en su subtest de reanudación con la base sana, revisar jobs huérfanos (`select state, count(*) from pgboss.job where name='evaluation-run' group by state;`) y cancelarlos (`update pgboss.job set state='cancelled' where name='evaluation-run' and state in ('created','retry');`). No es un bug del worker: es contaminación de corridas de test interrumpidas.
- **Grants del worker sobre catálogo**: 004 le da INSERT solo sobre sources/ediciones/claims/loads. No «arreglar» un permission denied de empresas/organizadores/participaciones con grants: que la importación no cree esas identidades es diseño del ticket.
- **Material `'imported'`**: lo escribe SOLO el importador; `parseCurationManifest` sigue rechazándolo en manifiestos. No etiquetar material importado como `synthetic`/`curated`.
- Siguen vigentes: drift esperado del manifiesto v0 (baseline en modo diagnóstico; no regenerar `characterization.json`/`manifest.json`), timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), caches por término globales del proceso, warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»; `infra-local-ticket-08` actualizada con 004 y la higiene de la cola).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/11-luma-a-dossier-durable.md`, verificar `docker ps | grep growthx-postgres` (si no está: `pnpm --dir frontend db:up && pnpm --dir frontend db:migrate`), correr `pnpm --dir frontend test` para confirmar 133+11 en verde, y esperar las decisiones de Julian (commit del slice; autorización de 12 y D1–D5, en particular D4 para el smoke real de Luma) antes de escribir código.

---

## Session — 2026-09-09 02:27 UTC

### Resumen de la sesión

Se implementó el ticket **12 — Persistir la comparación y su snapshot oficial** (`.scratch/evaluacion-persistida/issues/12-comparacion-y-snapshot-oficial.md`), autorizado explícitamente por Julian (cubrió solo este ticket; su bloqueo por 10 ya estaba resuelto). El ticket quedó en `Status: ready-for-human` con los 12 criterios marcados y `## Comments` completa (qué se hizo, tests con salida real, desvíos autorizados, límites). **No se hizo commit ni push**: los hace Julian.

Alcance ampliado autorizado en sesión (AskUserQuestion, opción «Todo: A + B + migración»): además de los archivos del ticket, `lib/server/evaluations/wire.ts`, `service.ts` y `run-worker.ts` (A), `lib/api/atlas-client.ts` + `components/research-dashboard/research-dashboard.tsx` + nuevo `comparison-panel.tsx` (B), y la migración `db/migrations/005-comparacion-y-snapshot.sql`. Los módulos nuevos sin ruta fija quedaron en `lib/server/evaluations/`.

Qué se construyó:

- **Aceptación durable**: `POST /api/evaluations` acepta `mode: 'investment_comparison'` por la MISMA frontera (parseo estricto en `wire.ts`: 1–3 ediciones, conjunto normalizado sin duplicados; `service.ts › acceptComparison`): perfil reutilizado de una investigación existente (`profileRunId` — misma revisión para todos los candidatos), ediciones validadas bajo RLS contra el catálogo del tenant, run + 4 steps + job pg-boss en una transacción, idempotencia por conjunto (mismo conjunto en otro orden = duplicado; otro conjunto con la misma clave = 409). Las rutas HTTP (`route.ts`) no cambiaron.
- **Workflow `investment-comparison/1`** (`lib/server/evaluations/compare.ts`, steps en el worker): `validate_profile → evaluate_candidates → compose_narrative → publish_result`. `evaluate_candidates` es la etapa determinística: un solo instante para todos los candidatos, catálogo disponible registrado APARTE del conjunto comparado (no se inventan candidatos para un top 3), **elegibilidad antes del score** (`eligibility.ts`: excluyen los conflictos CONFIRMADOS — fecha vencida bajo cualquier zona/política de 04, fecha fuera de la ventana del perfil, partida con soporte que excede el presupuesto declarado, acceso documentado que coincide con una restricción, ciudad respaldada distinta de SF; los faltantes generan `PendingCondition` con `resolution`), features `features/1` con la razón de cada dato ausente (`scoring-policy.ts › extractFeatures`; costo desconocido = null con razón, jamás 0), política o su ausencia, sombra v0 offline y el **snapshot oficial inmutable confirmado ahí, ANTES de pedir redacción**. Reentrega del job → devuelve el snapshot confirmado, sin duplicar ni reescribir.
- **Política de scoring v1** (`scoring-policy.ts`): `ScoringPolicy` versionada con `approval` explícito; `approvedPolicyFor()` devuelve **null para todo objetivo (D2)** — en producción toda comparación sale factual con «política pendiente»; la política ficticia (`pol-cmp-ficticia`, `approval: test_only`) vive SOLO en el test. `applyScoringPolicy`: S_known renormalizado sobre dimensiones activas (`weightedScore`), Q = `activeWeightFraction` (helper nuevo en `score-utils.ts`, aditivo), desempate por id estable ante empate exacto (convención de 06), nota de sensibilidad a faltantes (rango peor/mejor caso y con qué vecino podría invertirse el orden) y abstención `insufficient_data` con todas las dimensiones ausentes (nunca 0).
- **Adaptador de modelo** (`model-adapter.ts`): API directa de Gemini con transporte inyectable, presupuesto acotado (1 llamada, timeout 15 s), sin tools de discovery; entrada = SOLO claims fijados por el snapshot. Cita inexistente/ajena/ausente → salida rechazada ENTERA (sin filtrar ni sustituir); cifra sin respaldo literal en los claims citados → propuesta retenida con nota; `rank`/`score`/`eligibility`/ediciones desconocidas devueltos → descartados y REGISTRADOS como intento sin autoridad. Registra modelo, `promptVersion` (`comparison-narrative/1`), duración, uso (tokens) y motivo de rechazo/degradación; cualquier fallo → `deterministic_only` sin tocar nada.
- **Repositorio de snapshots** (`snapshot-store.ts`) + **migración 005**: `growthx.snapshots` (payload = `EvaluationSnapshot` del contrato 07 validado en escritura Y relectura, `narrative` null obligatorio al confirmar) con columnas companion `features`/`v0_shadow`/`available_catalog` — **los contratos de 07 NO se tocaron** (están cerrados; los companions van junto al payload) — y `growthx.snapshot_narratives` (≤1 por snapshot, reentrega reutiliza; defensa en profundidad: citas fuera del snapshot no se persisten). **Inmutabilidad por grants**: ni app ni worker tienen UPDATE/DELETE (probado con ambos roles). La migración también suma `investment_comparison` al check de `runs.mode`.
- **Sombra v0** (`compare.ts › shadowCompareWithV0` + `loadFrozenV0Reference`): offline contra `tests/fixtures/baseline-v0/characterization.json › local` (nada se re-graba ni se consulta afuera). Match por nombre → «no comparable» («unidad community/market y objetivo v0 distintos») con el score v0 SOLO dentro del registro de sombra; sin match → «v0 no evaluó este evento»; sin referencia → se declara. Ningún score v0 llena campos de v1 (asertado).
- **UI**: checkboxes de selección (hasta 3, con tope) y botón «Comparar seleccionadas» en Eventos (`research-dashboard.tsx`), panel `comparison-panel.tsx` proyectado por `opportunity-adapter.ts › projectComparisonResult` (reusa `projectEvaluationRead` de 07): por candidato «Descartado por restricción» / «Condicionado» / «Elegible», motivos, condiciones con **qué respuesta las resolvería**, fuentes, features, score solo con política o «política pendiente», lectura del modelo como registro aparte y sombra v0. `confidence-bars.tsx` suma `CoverageBar` (Q con label «no es probabilidad de éxito»; consenso jamás fusionado). `atlas-client.ts`: `startComparison`, `comparisonResult(run)` y tipos espejo. Una recarga con `?run=` recupera el MISMO snapshot.
- **Test nuevo `tests/integration/evaluation-snapshot.test.ts`** (14 subtests, PostgreSQL real; sin base se salta con aviso; catálogo sintético propio de 6 ediciones: elegible / condicionada / sobre-presupuesto / Berlín / vencida / opaca-país): frontera HTTP (401/400/409, tenantId rechazado, steps+job en el commit, idempotencia por conjunto), exclusión antes del score, score con faltantes (S_known 65 exacto, Q, sensibilidad), desempate en ambos órdenes de llegada, modelo adversarial (rank/score descartados, cifra «500» retenida con advertencia persistida, cita ajena → rechazo entero) con snapshot releído idéntico, inmutabilidad (permission denied + reentrega con otro reloj → mismo snapshot), catálogo disponible vs comparado, sombra v0 (con y sin match, sin referencia, loader real), sin política (factual + criterios SF: Berlín y vencida excluidas; organizador pertinente sin evento futuro investigable, nada suyo elegible), abstención + fallo HTTP 503 del adaptador, guardar y releer desde conexión nueva (deepEqual con `runs.result`), invariantes 03–06 sobre la proyección, conflicto de acceso confirmado (regla pura — el intake no captura `restrictions` todavía, ese camino no es alcanzable por HTTP), y tenant señuelo (RLS).

Verificación de navegador manual (Playwright, no versionada, misma decisión que 08–11): dev server real en :3210 + worker real + sesión dev; Eventos → selección 3/3 con tope → comparar → panel con snapshot persistido, «política pendiente» (sin GEMINI_API_KEY la redacción degrada declarándolo), estados por candidato, condiciones con respuesta, «elegible no significa recomendado», sombra v0; recarga con `?run=` recupera el mismo snapshot; **0 llamadas al pipeline global**. 12/12 checks; capturas revisadas.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en ninguna sesión del slice). Árbol sucio preexistente ajeno intacto (~125 rutas en total).
- Cambios de esta sesión, sin commitear: `M frontend/lib/server/scoring/score-utils.ts` (helper Q; único archivo con drift NUEVO respecto del manifiesto v0), `M frontend/lib/api/atlas-client.ts`, `M frontend/lib/api/opportunity-adapter.ts`, `M frontend/components/atlas/confidence-bars.tsx` (los tres ya tenían ediciones previas); dentro de dirs sin trackear: `db/migrations/005-comparacion-y-snapshot.sql` (nuevo), `lib/server/evaluations/eligibility.ts`, `scoring-policy.ts`, `model-adapter.ts`, `snapshot-store.ts`, `compare.ts` (nuevos), `wire.ts`/`service.ts`/`run-worker.ts` (editados), `components/research-dashboard/comparison-panel.tsx` (nuevo) y `research-dashboard.tsx` (editado), `tests/integration/evaluation-snapshot.test.ts` (nuevo), ticket 12 (Status, criterios, Comments). `gemini.ts`, `result-rail.tsx` y `opportunity-drawer.tsx` (listados como probables) quedaron SIN cambios, documentado.
- Tests: `pnpm --dir frontend test` → **148 pass / 0 fail** (133 previos + 15 nuevos) + **11/11 e2e**, 0 skipped, exit 0. `pnpm --dir frontend lint` → exit 0 sin warnings. `npx tsc --noEmit` limpio. `pnpm build` OK. `test:baseline` → 8/8, O1–O5 «corregido», sin INESPERADO (drift solo suma `score-utils.ts`).
- Infra local: migración **005 YA aplicada** al contenedor `growthx-postgres`. El check de navegador dejó en `growthx-dev` un run de investigación y uno de comparación con su snapshot (inocuos, borrables) y `db:seed-dev` **rotó el token de la sesión dev**. Cola pg-boss sin huérfanos (el test cancela los suyos, tenants `it-cmp-%`). No quedó ningún proceso corriendo (si Julian tenía un `next dev` propio abierto durante la sesión, la limpieza pudo cerrarlo; se relanza con `growthx-frontend` de `.claude/launch.json`).
- Tickets: **01–12 en `ready-for-human`**; 13–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 12 (incluyen el alcance ampliado autorizado, los archivos listados-y-no-tocados, los companions fuera del contrato 07 y los límites: `restrictions` no capturadas por el intake, historial del Resumen solo lista runs `sf-organizers/1`) y commitear todo el slice (mensaje en español).
2. **Ticket 13** (siguiente del slice: decisión condicional persistida): requiere autorización explícita y pase a `ready-for-agent`. 12 le deja listos el snapshot oficial persistido e inmutable (`growthx.snapshots`), `EvaluationDecision`/`DecisionCondition` ya modelados en el contrato 07, la ruta de lectura del run y el panel donde mostrar el estado de decisión.
3. **Decisiones abiertas D1–D5**: D2 sigue siendo la más visible tras 12 (sin política aprobada, toda comparación sale «política pendiente»; publicar ranking de inversión espera esa aprobación). D4 (catálogo real) y D3/D5 (acceso/operación) sin cambios.
4. Sigue abierta la decisión de promover el alias `@/` a un preload compartido; 12 lo esquivó igual que 02–11 (imports relativos `.ts`).

### Bloqueos y advertencias

- **Autorización por ticket**: 13 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent`. En esta sesión el criterio fue alcance estricto con UNA pregunta previa (AskUserQuestion con el conjunto completo de archivos extra) — confirmar el criterio por ticket.
- **Inmutabilidad por grants**: `growthx.snapshots` y `snapshot_narratives` no admiten UPDATE/DELETE para ningún rol de aplicación. No «arreglar» un permission denied con grants: una corrección es OTRO run con OTRO snapshot.
- **`approvedPolicyFor` es la única fuente de política en producción** y devuelve null (D2). Resolver D2 = editar esa función (y solo esa) con la política aprobada; los pesos del test (`pol-cmp-ficticia`) no se despliegan.
- **Companions del snapshot**: features/sombra-v0/catálogo-disponible viven en columnas junto al payload, NO dentro del contrato 07. Si un ticket futuro los quiere en el contrato, es un cambio de contrato explícito (contrato + validador + test juntos).
- **Token dev rotado**: el token impreso por `db:seed-dev` en sesiones anteriores ya no sirve; regenerar con `pnpm --dir frontend db:seed-dev` (requiere `GROWTHX_ADMIN_DATABASE_URL` en el entorno del comando; `.env.local` no aplica a scripts CLI).
- Siguen vigentes: drift esperado del manifiesto v0 (baseline en modo diagnóstico; no regenerar `characterization.json`/`manifest.json` — la sombra v0 de 12 LEE ese archivo, otro motivo para no re-grabarlo), higiene de la cola pg-boss ante tests interrumpidos, timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto (`infra-local-ticket-08` actualizada con 005, el token rotado y los datos de demo).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/12-comparacion-y-snapshot-oficial.md`, verificar `docker ps | grep growthx-postgres` (si no está: `pnpm --dir frontend db:up && pnpm --dir frontend db:migrate`), correr `pnpm --dir frontend test` para confirmar 148+11 en verde, y esperar las decisiones de Julian (commit del slice; autorización de 13 y D1–D5) antes de escribir código. Para ver la demo de comparación: `pnpm db:seed-dev` (token nuevo) + dev server + worker, Eventos → seleccionar hasta 3 → «Comparar seleccionadas».

---

## Session — 2026-09-09 03:33 UTC

### Resumen de la sesión

Se implementó el ticket **13 — Guardar una decisión condicional y su campaña en borrador** (`.scratch/evaluacion-persistida/issues/13-guardar-decision-condicional.md`), autorizado explícitamente por Julian (cubrió solo este ticket; su bloqueo por 12 ya estaba resuelto). El ticket quedó en `Status: ready-for-human` con los 8 criterios marcados y `## Comments` completa (qué se hizo, tests con salida real, desvíos autorizados, límites). **No se hizo commit ni push**: los hace Julian.

Alcance ampliado autorizado en sesión (AskUserQuestion, dos preguntas): (1) migración `006`, UI en `comparison-panel.tsx` + una línea en `research-dashboard.tsx`, y export mínimo en `opportunity-adapter.ts`; (2) **edición del contrato v1** con condiciones — campos nuevos nullable de verdad (ausente = null, jamás string vacío ni default), la validación de «acordado» exige confirmedBy/confirmedAt/evidencia juntos o rechaza, y `evaluation.ts` + `evaluation-validation.ts` + `evaluation.test.ts` se actualizan en el mismo cambio incluyendo round-trip. Condiciones de Julian para la 006 (todas cumplidas): RLS forzada, FKs compuestas por tenant, decisiones append-only (PATCH crea revisión, nunca UPDATE destructivo), grants mínimos, transacción decisión+campaña atómica.

Qué se construyó:

- **Contratos (07, edición v1)**: `DecisionCondition` suma `owner`/`dueBy` (nullable; `''` o plazo no-ISO se rechazan); la confirmación de `CampaignCommitment` pasa a `{ method, sourceIds, confirmedBy, confirmedAt }` — «acordado» sin cualquiera de los cuatro (o sin fuentes) se rechaza; estimación/meta con confirmación se sigue rechazando. El test de contratos (14 casos) actualizó fixtures y sumó rechazos y round-trip de ambas formas.
- **Migración `db/migrations/006-decision-condicional.sql`**: `growthx.decisions` — cada fila es UNA revisión inmutable (identidad `decision_id`, cadena lineal `previous_revision_id` con `unique nulls not distinct`); `unique (tenant, decision, revision)` decide la carrera entre pestañas; índice parcial = una sola decisión por `(snapshot, edition)`; clave idempotente única; FKs compuestas al snapshot de 12, a `event_editions` y a la revisión anterior. `growthx.campaign_drafts`: un borrador por revisión de decisión (`id` es TEXT — ver bloqueos). RLS enable+force; grants: `growthx_app` select+insert; **nadie** tiene UPDATE/DELETE; el worker no ve decisiones.
- **`lib/server/decisions/store.ts` REESCRITO** (fuera el Map de Launch Room; `consensus`/`confidenceDelta` no existen más) + **`lib/server/decisions/wire.ts` nuevo** (parseo estricto; `tenantId`/`decidedBy`/`consensus`/`confidenceDelta` en el cuerpo → 400 con mensaje propio): `saveDecision` valida contra el snapshot bajo RLS, rechaza elegir un candidato `excluded` (corregir exige nueva evidencia + otra evaluación), hereda ABIERTAS las condiciones pendientes del snapshot al elegir (elección condicional garantizada), autor desde la sesión (`server_session`), y confirma decisión + `CampaignDraftRecord` en UNA transacción idempotente (misma clave+payload → misma decisión; otra → 409; carrera → conflicto por unique). Si la elección no trae borrador, el servidor compone el esqueleto desde snapshot y perfil (partidas desde claims `cost:*` — `quoted` con fuente / `unknown` con nota, jamás 0; objetivo provisional «por confirmar» (D1); modalidad pendiente; preguntas desde condiciones). `reviseDecision`: revisión esperada (obsoleta → 409 con la vigente, sin tocar nada), conserva todas las revisiones, re-resolver una condición resuelta → 400, identidad de campaña estable entre revisiones. Lecturas revalidan contra el contrato.
- **Rutas**: `app/api/decisions/route.ts` (nuevo): POST + GET `?snapshotId=` (para recuperar el estado del panel al reabrir el run; agregado sobre la frontera de la spec, documentado); `app/api/decisions/[id]/route.ts` reescrito: GET persistido/autorizado (404 sin confirmar existencia ajena) y PATCH. 503 tipado en modo degradado. Respuesta = decisión, revisiones, campaña, `decisionId`/`snapshotId`/`editionId`.
- **`lib/api/atlas-client.ts`**: sección Launch Room (`fetchDecision`/`pollDecision`, sin consumidores desde el borrado de Linq) reemplazada por `saveConditionalDecision`/`reviseConditionalDecision`/`fetchDecisionRead`/`fetchSnapshotDecisions` (outcomes tipados, nunca lanzan). **`opportunity-adapter.ts`**: la proyección de campaña se extrajo de `projectEvaluationRead` y se exporta como `projectCampaignDraft` (cero cambios de comportamiento).
- **UI**: `comparison-panel.tsx` — «Registrar decisión» por candidato (elegir/descartar/pendiente, motivos obligatorios, «Elegir» deshabilitado si excluido con nota, editor de condiciones con pregunta/respuesta esperada/efecto/responsable/plazo, guardado con clave idempotente conservada en reintentos, «Elegida · elección condicional», resolución de condición vía PATCH, navegación panel→campaña, recuperación por snapshot al montar). `campaign-panel.tsx` — `CampaignDraftPanel` nuevo (borrador persistido: partidas sin 0, compromisos «Acordado · con/SIN soporte», copiar borrador manual, sin ejecutar/medir/exportar) y `CampaignPanel` v0 SIN funnel/atribución (criterio 8). `opportunity-drawer.tsx` — fuera «Export brief». `research-dashboard.tsx` — la sección Decisiones dejó de decir «no disponible».
- **Test `frontend/tests/integration/conditional-decision.test.ts`** (11 subtests, PostgreSQL real; sin base se salta): catálogo sintético propio (elegible / condicionada / sobre-presupuesto), perfil + dos comparaciones procesadas in-process (sin política — D2 — y sin red), rutas HTTP reales: frontera (401/400/404 y consenso rechazado con mensaje), motivos obligatorios, elegir con costo pendiente → condicional con campaña en la misma respuesta (partida unknown, «por confirmar», autor en columna, GET idéntico, sin consensus en todo el registro), idempotencia (retry → misma decisión; misma clave+otro payload → 409; otra clave+misma alternativa → 409 already_decided), excluido (elegir → 409 sin persistir, también por PATCH; descarte propio → 201 sin campaña; borrador con descarte → 400), conflicto entre pestañas (revisión 2 vs esperada 1 → 409 con currentRevision; revisiones conservadas; re-resolver → 400), razones distintas por alternativa sin fabricar claims (conteo del tenant invariante), organizador guardado (worker real + `saveOrganizerResearch`) sin decisiones ni campañas, rollback conjunto (pool envenenado en el INSERT de campaña → cero filas; vía sana → decisión Y campaña con partida quoted) + variantes de «acordado» (sin confirmación → 400, sin confirmedBy → 400, completo → 200 con campaña de identidad estable), tenant señuelo (ruta y SQL bajo RLS).

Verificación de navegador (Playwright manual con tenant de demo propio, no versionada, misma decisión que 08–12): dev server :3210, `/?run=` → panel → elegir con condición completa → campaña persistida abierta (partida pendiente sin 0, por confirmar, copiar borrador, sin ejecutar/medir/exportar) → «Elegida · elección condicional» con responsable y plazo → excluido con Elegir deshabilitado + descarte sin outcome → recarga recupera decisión y campaña sin llamar al pipeline global → resolver condición → revisión 2. **17/17 checks**; capturas revisadas.

Desvío mínimo documentado: `tests/e2e/sf-organizer-research.spec.ts` aseveraba el placeholder «todavía no está disponible» de Decisiones (escrito en 10 para caducar con 13); se actualizó SOLO esa aserción al texto nuevo (mismo criterio que el desvío de 05). La pregunta al organizador y la respuesta esperada se componen determinísticamente en `description` de la condición (la autorización de contrato cubrió owner/dueBy y confirmedBy/confirmedAt); campos estructurados propios serían otra edición explícita.

### Estado actual

- Rama: `main`. HEAD: `480712c` (sin commits nuevos en ninguna sesión del slice). Árbol sucio preexistente ajeno intacto (~127 rutas en total).
- Cambios de esta sesión, sin commitear: `M frontend/components/atlas/campaign-panel.tsx`, `M frontend/components/atlas/opportunity-drawer.tsx`, `M frontend/lib/api/atlas-client.ts`, `M frontend/lib/api/opportunity-adapter.ts`, `M frontend/app/api/decisions/[id]/route.ts`, `M frontend/lib/server/decisions/store.ts` (reescrito); nuevos `frontend/app/api/decisions/route.ts`, `frontend/lib/server/decisions/wire.ts`; dentro de dirs sin trackear de sesiones previas: `lib/contracts/evaluation.ts` y `evaluation-validation.ts` (edición v1), `tests/contracts/evaluation.test.ts`, `db/migrations/006-decision-condicional.sql` (nuevo), `components/research-dashboard/comparison-panel.tsx` y `research-dashboard.tsx`, `tests/e2e/sf-organizer-research.spec.ts` (aserción caducada), `tests/integration/conditional-decision.test.ts` (nuevo), ticket 13 (Status, criterios, Comments).
- Tests: `pnpm --dir frontend test` → **159 pass / 0 fail** (148 previos + 11 nuevos) + **11/11 e2e**, 0 skipped, exit 0. `pnpm --dir frontend lint` → exit 0 sin warnings. `npx tsc --noEmit` limpio. `pnpm build` OK (rutas `/api/decisions` y `/api/decisions/[id]` presentes). `test:baseline` → 8/8, O1–O5 «corregido», sin INESPERADO.
- Infra local: migración **006 YA aplicada** al contenedor `growthx-postgres` (con un `alter table growthx.campaign_drafts alter column id type text` manual: la primera versión aplicada tenía uuid; el archivo quedó corregido y una base fresca la crea bien). Quedó un tenant de demo `demo-dcn-*` con catálogo sintético, dos runs y una decisión con campaña (inocuo, borrable). El token de `growthx-dev` NO se rotó. Ningún proceso quedó corriendo. (Memoria del proyecto `infra-local-ticket-08` actualizada.)
- Tickets: **01–13 en `ready-for-human`**; 14–15 en `needs-triage`, no autorizados.

### Tareas pendientes (en orden)

1. **Julian**: revisar los Comments de 13 (incluyen el alcance ampliado, la edición del contrato v1, el desvío del e2e, la composición pregunta/respuesta dentro de `description`, y el ALTER manual de la 006 en el contenedor) y commitear todo el slice (mensaje en español).
2. **Ticket 14** (siguiente del slice): requiere autorización explícita y pase a `ready-for-agent`. 13 le deja listos: decisiones append-only con revisiones y campaña persistida (`growthx.decisions`/`campaign_drafts`), la frontera `/api/decisions` completa, `projectCampaignDraft` y la UI de decisión sobre el panel de comparación. Nota: `buildReadBundle` (snapshot-store) sigue devolviendo `decision`/`campaign` null a propósito — integrarlos a la lectura del run sería releer en cada GET; hacerlo solo si un ticket lo pide.
3. **Decisiones abiertas D1–D5**: sin cambios — D2 (política) sigue dejando toda comparación «política pendiente»; D4 (catálogo real) y D3/D5 (acceso/operación) abiertas.
4. Sigue abierta la decisión de promover el alias `@/` a un preload compartido; 13 lo esquivó igual que 02–12 (imports relativos `.ts`).

### Bloqueos y advertencias

- **Autorización por ticket**: 14 en adelante necesitan visto bueno explícito de Julian y `ready-for-agent`. En esta sesión el criterio fue alcance estricto con pregunta previa (AskUserQuestion, dos preguntas: archivos extra + estrategia de contrato) — confirmar el criterio por ticket.
- **Append-only por grants**: `growthx.decisions` y `campaign_drafts` no admiten UPDATE/DELETE para ningún rol. No «arreglar» un permission denied con grants: una corrección es una revisión nueva (PATCH con revisión esperada); revisar un snapshot inmutable sigue siendo OTRO run.
- **Contrato v1 editado**: `DecisionCondition.owner/dueBy` y `confirmation.confirmedBy/confirmedAt` ya son parte del contrato; cualquier payload persistido/fixture nuevo debe llevarlos (null explícito si no se conocen — los validadores rechazan la ausencia del campo y el string vacío).
- **`campaign_drafts.id` es TEXT** (ids `camp-…`): si alguien recrea la base desde migraciones, sale bien; el contenedor actual ya tiene el ALTER aplicado.
- **Aserciones destinadas a caducar**: el e2e de 10 ya no exige el placeholder de Decisiones; quien toque esa sección debe actualizar la aserción nueva («se registran sobre el panel de una comparación»).
- Siguen vigentes: drift esperado del manifiesto v0 (baseline en modo diagnóstico; no regenerar `characterization.json`/`manifest.json` — la sombra v0 lo LEE), higiene de la cola pg-boss ante tests interrumpidos (esta suite cancela los suyos, tenants `it-dcn-%`), timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`), warnings `MODULE_TYPELESS_PACKAGE_JSON` preexistentes, y la memoria del proyecto («en prompts para sesiones-worker, no repetir lo que ya dice el ticket .md»; `infra-local-ticket-08` actualizada con 006 y el tenant de demo).

### Primera acción sugerida para la próxima sesión

Leer los Comments de `.scratch/evaluacion-persistida/issues/13-guardar-decision-condicional.md`, verificar `docker ps | grep growthx-postgres` (si no está: `pnpm --dir frontend db:up && pnpm --dir frontend db:migrate`), correr `pnpm --dir frontend test` para confirmar 159+11 en verde, y esperar las decisiones de Julian (commit del slice; autorización de 14 y D1–D5) antes de escribir código. Para ver la demo de decisión: sembrar sesión + comparación (o reusar `growthx-dev` con `db:seed-dev`, que rota el token), abrir `/?run=<comparación>` → «Registrar decisión» → elegir con condición → campaña persistida.
