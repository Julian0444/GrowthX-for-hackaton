# 10 — Abrir el dashboard de SF y encontrar organizadores pertinentes

Status: ready-for-human

**Estado:** implementado con autorización explícita de Julian; listo para revisión humana.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [09](./09-dossier-catalogo-curado.md).

## Objetivo

Convertir el perfil de empresa en una investigación persistida de organizadores de SF desde un dashboard con navegación izquierda, dejando el mapa como vista secundaria.

## Aristas de bloqueo

09 → 10: necesita expedientes y relaciones por edición. Un directorio de nombres sin antecedentes no demuestra pertinencia.

## Criterios de aceptación

- [x] La entrada es un dashboard con navegación izquierda: Resumen, Organizadores, Eventos y Decisiones; perfil accesible. Se reutilizan fuentes, dossier e importador, sin crear otra landing ni rediseñar todo el sistema visual.
- [x] El perfil recoge producto, audiencia, stack, objetivo, presupuesto y fechas; admite empresas comparables indicadas por el cliente. La interpretación propuesta se puede corregir antes de investigar; no inventa competidores ni objetivo comercial.
- [x] El workflow consulta el catálogo curado de SF y persiste candidatos, perfil, criterios y revisiones. SQL y filtros estructurados bastan; no añade pgvector ni búsqueda web automática.
- [x] Por organizador muestra razones con antecedentes: tema/stack, audiencia declarada con su estado, formato, ediciones y empresas con roles documentados. Afinidad no equivale a reputación, popularidad ni probabilidad de ROI.
- [x] Permite abrir el expediente y recorrer empresa → edición → rol → fuente. Una empresa comparable no tuvo éxito por estar presente; el resultado comercial ausente se muestra desconocido.
- [x] Se declara tamaño/fecha de cobertura. Sin coincidencias, informa el límite y permite incorporar una URL de Luma; no completa «los mejores de SF» con hipótesis.
- [x] Guardar un organizador sin evento elegible conserva una investigación pendiente. Eventos futuros fuera de SF no se recomiendan; antecedentes externos conservan su ciudad.
- [x] Eventos permite Lista / Mapa de SF con iguales IDs y fuentes. El mapa no se abre por defecto ni compara ciudades; no se necesita para investigar o decidir. La sede del organizador no se usa como ubicación del evento.
- [x] Vacíos, progreso y errores vienen de PostgreSQL; no se muestran cifras ficticias ni refrescos del pipeline mundial.

## Demostración

Describir una herramienta para equipos que construyen agentes, confirmar audiencia y empresas de referencia, encontrar organizadores cubiertos y abrir el antecedente de una coincidencia. Mostrar un resultado desconocido y pasar a una edición futura sin abrir el mapa. Después alternar Lista/Mapa para comprobar que es la misma información.

## Módulos y archivos probablemente afectados

Existentes: `frontend/components/atlas/atlas-shell.tsx`, `frontend/components/atlas/onboarding-intake.tsx`, `frontend/components/atlas/opportunity-drawer.tsx`, `frontend/components/atlas/world-map.tsx`, `frontend/lib/api/atlas-client.ts`, `frontend/app/globals.css`.
Nuevos previstos: `frontend/components/research-dashboard/`, selección estructurada en `frontend/lib/server/evaluations/` y `frontend/tests/e2e/sf-organizer-research.spec.ts`. Decisiones muestra su estado vacío hasta 13–14; no simula guardados.

## Qué test lo demuestra

`sf-organizer-research.spec.ts` con PostgreSQL/worker reales y catálogo controlado: perfil → matching → razones → expediente → empresa/rol. Incluye homónimos, ausencia de coincidencia, antecedente fuera de SF, evento futuro fuera de SF y logo ambiguo. Verifica cero llamadas al pipeline global y recorrido completo con el mapa cerrado.

## Decisiones abiertas

**DECISIÓN ABIERTA D1/D2:** objetivo y criterios comerciales. Se muestran factores explícitos, no pesos de una política no aprobada.
**DECISIÓN ABIERTA D4:** organizadores y antecedentes reales pertinentes. Fixtures no acreditan cobertura de SF ni ventaja sobre investigación manual.


## Comments

Implementado el 2026-09-08. Sin commit ni push. La autorización de Julian reemplazó los avisos de «no autorizado» de los documentos; se cambió a `ready-for-agent` antes de implementar y a `ready-for-human` después de verificar.

### Qué se hizo

- **Dashboard de entrada:** `atlas-shell.tsx` monta el dashboard de SF con navegación izquierda Resumen / Organizadores / Eventos / Decisiones y Perfil accesible. Se retiraron de esa entrada la búsqueda mundial, sus refrescos y el mapa por defecto. Se conservan las fuentes, tokens y superficies existentes; los módulos v0 siguen disponibles para la caracterización, sin convertirlos en recomendaciones del dashboard.
- **Perfil revisable:** `onboarding-intake.tsx` recoge producto, audiencia, stack/temas, objetivo elegido, presupuesto desconocido o declarado y fechas. Antes de investigar muestra una interpretación literal corregible. Las empresas las indica el cliente; vincularlas requiere seleccionar explícitamente una identidad del catálogo (ID, nombre y sitio). Los homónimos no se fusionan y una referencia sin vincular no genera matching. No se inventan competidores, métricas de éxito ni pesos comerciales.
- **Workflow `sf-organizers/1`:** selección estructurada en `lib/server/evaluations/research.ts`, sobre PostgreSQL con el rol del worker y RLS. Usa las últimas revisiones y factores respaldados de tema/stack, audiencia y participaciones de identidades confirmadas. Excluye claims pendientes o contradichos del matching afirmativo. Persiste criterios, candidatos, razones, fuentes y lecturas de dossiers/expedientes con sus revisiones dentro del resultado del run. Sin coincidencias o sin catálogo declara el límite; este workflow nunca usa el fixture de relleno de 08, pgvector ni búsqueda web.
- **Revisiones de perfil:** aceptación por el servicio existente, idempotencia que incluye alcance e investigación anterior, versiones nuevas dentro del mismo lineage y lock transaccional para asignarlas. Validación de las identidades comparables dentro del tenant y de días calendario reales. Una reevaluación conserva los resultados y perfiles anteriores; una recarga por `?run=` los recupera sin volver a investigar.
- **Organizadores y expedientes:** las razones conservan IDs de revisión y fuentes; el expediente muestra tema/stack, audiencia con su estado, formato documentado o pendiente, ediciones, participaciones, roles y resultado comercial desconocido. Se reutilizan las proyecciones de dossier de 09 y `SourceRecordLinks`. El recorrido empresa → edición → rol → fuente funciona sin mapa; logos no se convierten en patrocinio pagado y la presencia de comparables no demuestra éxito.
- **Guardar para investigar:** tabla `organizer_research` con RLS forzada, claves foráneas compuestas por tenant y clave única por run/organizador. El POST autenticado solo guarda candidatos de un run completo; el estado real queda `pending_research` aunque no haya una edición local futura respaldada. Es idempotente y se recupera en el dashboard. Decisiones conserva su estado de funcionalidad pendiente de 13–14, sin decisiones simuladas.
- **Publicación y lecturas concurrentes:** las tarjetas se muestran cuando el worker confirmó el run completo. Una lectura anterior no puede retirar del cliente un guardado append-only que el servidor ya confirmó. El E2E detectó una intermitencia de presentación durante el cierre del run; se corrigió esta coordinación y luego se repitieron las pruebas en verde.
- **Eventos Lista / Mapa:** ambas vistas consumen el mismo array de ediciones SF y las mismas fuentes e IDs. El mapa es una cuadrícula geográfica local con coordenadas de la edición y soporte urbano, sin geocodificar la sede del organizador. Las filas sin punto siguen accesibles. Las ediciones futuras fuera de SF no aparecen como alternativas locales; los antecedentes externos mantienen su ciudad en el expediente. Fecha, lugar, ventana y partidas que exceden el presupuesto se comprueban antes de ofrecer el enlace a una edición futura; ese enlace no declara resueltos acceso, audiencia ni costo total.
- **Cobertura y estados:** cantidad de organizadores/ediciones, fechas de verificación, material, historial, pasos, intentos y errores se leen de PostgreSQL. No se fabrican cifras ni estados de pipeline mundial. El importador Luma existente está disponible en Eventos y al no encontrar coincidencias.

### Alcance y decisiones documentadas

Julian autorizó explícitamente estos cinco archivos adicionales antes de editarlos:

1. `frontend/db/migrations/003-dashboard-sf.sql`.
2. `frontend/app/api/evaluations/route.ts` (GET de historial/cobertura, conserva el POST existente).
3. `frontend/app/api/evaluations/[id]/organizers/[organizerId]/route.ts` (POST de guardado).
4. `frontend/package.json`.
5. `frontend/pnpm-lock.yaml`.

El resto de los cambios está dentro de las rutas nombradas por el ticket: `atlas-shell.tsx`, `onboarding-intake.tsx`, `atlas-client.ts`, `globals.css`, nuevos componentes dentro de `components/research-dashboard/`, selección/persistencia dentro de `lib/server/evaluations/` y el E2E previsto. No fue necesario modificar `opportunity-drawer.tsx` ni `world-map.tsx`: se reutilizan las proyecciones y fuentes del dossier y el mapa SF se monta dentro del nuevo dashboard. `plan/handoff.md` se leyó para restaurar contexto y no se editó.

Límites conservados:

- D1/D2: objetivo comercial y política de inversión pendientes; no hay ranking de mérito ni score de reputación/ROI.
- D4: el E2E usa catálogo **sintético y etiquetado**. Prueba el mecanismo y no acredita cobertura real ni ventaja frente a investigación manual. La carga real sigue siendo la curación explícita de 09.
- El importador Luma se reutiliza tal como existe: su lectura nueva todavía no se persiste como dossier. Se declara en la UI; la persistencia de URL corresponde al ticket 11.
- Los runs anteriores conservan su workflow `evaluation-run/1` y su comportamiento de compatibilidad de 08–09; la entrada nueva siempre solicita `sf-organizers/1`.
- El mapa usa una cuadrícula de latitud/longitud sin descargar cartografía ni sumar proveedores.

### Verificación

`pnpm --dir frontend test` ahora ejecuta la suite previa y el archivo `sf-organizer-research.spec.ts`. Playwright queda como dependencia de desarrollo; también se puede correr `pnpm --dir frontend test:e2e`. La base y Chromium son requisitos reales (sin infraestructura, el E2E falla explícitamente).

El E2E levanta Next y el worker en procesos separados, crea sesiones y tenants de prueba en PostgreSQL real y carga el catálogo controlado. Demuestra revisión del perfil antes de investigar, recuperación durante la cola, matching, dossiers/empresas/roles/fuentes, resultado desconocido, homónimos, logo ambiguo, futuro fuera de SF, guardado sin edición elegible y recarga, paridad Lista/Mapa, revisiones e idempotencia, RLS con tenant señuelo, identidad comparable exacta, selección por la última revisión, fallo real del worker con cuatro intentos y catálogo vacío sin relleno. Registra **0 llamadas al pipeline global**. Limpia sus propios tenants al terminar. Next usa una copia temporal desechable para no tocar `next-env.d.ts` ni interferir con el servidor de desarrollo de la persona.

Resultado final:

- `pnpm --dir frontend test`: exit 0; **120/120** en la suite previa y **11/11** en E2E (10 casos + suite contenedora); **0 fail, 0 skipped** en ambas ejecuciones.
- `pnpm --dir frontend lint`: exit 0, sin errores ni warnings de ESLint.
- `pnpm --dir frontend exec tsc --noEmit --incremental false`: exit 0.
- `git diff --check` sobre los archivos existentes modificados: exit 0.
- Capturas revisadas de Organizadores, dossier con contradicción, Eventos/Mapa y Perfil, en viewport 1366×900. Sin desbordes superpuestos; el contenido largo conserva scroll propio y navegación izquierda.
- Se mantienen los warnings preexistentes de Node `MODULE_TYPELESS_PACKAGE_JSON`, visibles en la salida real. No se cambió el tipo global del paquete para silenciarlos.

### Salida real completa de `pnpm --dir frontend test`

<details>
<summary>Salida de terminal (exit 0)</summary>

```text
$ node --test "tests/**/*.test.ts" && node --test tests/e2e/sf-organizer-research.spec.ts
TAP version 13
# [env] GROWTHX_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_app: rutas /api/evaluations y sesiones
# [env] GROWTHX_WORKER_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_worker: negocio del worker bajo RLS
# [env] GROWTHX_QUEUE_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_queue: cola pg-boss del worker
# (node:37733) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/acceptance/baseline-v0.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: manifiesto: reloj, perfil, política y captura sin secretos coinciden con el harness
ok 1 - manifiesto: reloj, perfil, política y captura sin secretos coinciden con el harness
  ---
  duration_ms: 1.925834
  type: 'test'
  ...
# Subtest: seeds: 136 eventos históricos sin alteración, clasificados en el reloj congelado
ok 2 - seeds: 136 eventos históricos sin alteración, clasificados en el reloj congelado
  ---
  duration_ms: 6.9
  type: 'test'
  ...
# Subtest: fixtures: fixture preparado y respuestas grabadas de proveedores sin alteración
ok 3 - fixtures: fixture preparado y respuestas grabadas de proveedores sin alteración
  ---
  duration_ms: 2.606541
  type: 'test'
  ...
# Subtest: repetición: sin red ni claves reales, dos corridas con el mismo reloj dan la misma salida
ok 4 - repetición: sin red ni claves reales, dos corridas con el mismo reloj dan la misma salida
  ---
  duration_ms: 292.460042
  type: 'test'
  ...
# Subtest: repetición: una petición no grabada falla en lugar de salir a la red
ok 5 - repetición: una petición no grabada falla en lugar de salir a la red
  ---
  duration_ms: 1.058375
  type: 'test'
  ...
# Subtest: caracterización: la salida congelada de v0 se repite exactamente mientras las fuentes coincidan con el manifiesto
ok 6 - caracterización: la salida congelada de v0 se repite exactamente mientras las fuentes coincidan con el manifiesto
  ---
  duration_ms: 46.3345
  type: 'test'
  ...
# fuentes distintas del manifiesto v0: lib/contracts/growxth.ts, lib/server/pipeline/resolve.ts, lib/server/pipeline/global-market-search.ts, lib/server/pipeline/search-opportunities.ts, lib/server/reasoning/gemini.ts, lib/server/discovery/exa-events.ts, lib/server/graph/derive-signals.ts, lib/server/markets/city-catalog.ts, lib/server/audit/labels.ts, lib/server/env.ts, lib/api/opportunity-adapter.ts, lib/api/types.ts, app/api/opportunities/search/route.ts. La igualdad con la caracterización solo se exige sobre v0; la corrección la prueban 02–06.
# Subtest: oráculos: los cinco casos se reproducen y cada observación es el defecto de v0 o la salida deseada
ok 7 - oráculos: los cinco casos se reproducen y cada observación es el defecto de v0 o la salida deseada
  ---
  duration_ms: 25.675667
  type: 'test'
  ...
# O1 (ticket 02) corregido: query.budgetUsd devuelto a la segunda petición secuencial (USD 20.000)
# O1 (ticket 02) corregido: query.budgetUsd devuelto a la segunda petición concurrente (USD 20.000)
# O1 (ticket 02) invariante: una petición equivalente (mismo presupuesto) sí reutiliza la respuesta
# O2 (ticket 03) corregido: mercado con señal de Trends exclusivamente nacional (India) presentado con market.city como ubicación (basis country)
# O2 (ticket 03) corregido: resultado de Exa sin lugar en el texto recibe como location la ciudad de la consulta
# O3 (ticket 04) corregido: oportunidades locales cuyo evento ya venció en el reloj congelado y aun así se citan como «upcoming»
# O3 (ticket 04) corregido: evento sin fecha: startsAt que el adaptador entrega a la UI
# O3 (ticket 04) corregido: recap de un evento del 12 Ago 2026 publicado el 5 Sep se cita como listing vivo (observed) en la razón de Exa
# O4 (ticket 05) corregido: narrativa que solo cita un id inexistente: se publica como razón y con qué citas
# O4 (ticket 05) corregido: narrativa de San Francisco que cita evidencia de Bengaluru (ajena): publicada como razón factual
# O4 (ticket 05) corregido: cifra («40+ meetups por trimestre») respaldada solo por un listing de un evento: publicada como razón factual
# O5 (ticket 06) corregido: orden de opportunities con modelo (rank invertido) frente al orden determinístico
# O5 (ticket 06) corregido: rank que el adaptador entrega a la UI sigue al orden del array recibido
# O5 (ticket 06) invariante: scores por oportunidad con y sin modelo
# Subtest: matriz: oracles.md documenta los cinco oráculos, su ticket y cómo reproducirlos
ok 8 - matriz: oracles.md documenta los cinco oráculos, su ticket y cómo reproducirlos
  ---
  duration_ms: 0.63725
  type: 'test'
  ...
# [env] GROWTHX_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_app: rutas /api/evaluations y sesiones
# [env] GROWTHX_WORKER_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_worker: negocio del worker bajo RLS
# [env] GROWTHX_QUEUE_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_queue: cola pg-boss del worker
# (node:37734) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/acceptance/cache-budget.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: secuencial: USD 20.000 tras USD 2.000 recibe su propia evaluación; la petición equivalente sí reutiliza
ok 9 - secuencial: USD 20.000 tras USD 2.000 recibe su propia evaluación; la petición equivalente sí reutiliza
  ---
  duration_ms: 131.205458
  type: 'test'
  ...
# Subtest: concurrente: presupuestos distintos no comparten la promesa en curso
ok 10 - concurrente: presupuestos distintos no comparten la promesa en curso
  ---
  duration_ms: 3.744584
  type: 'test'
  ...
# Subtest: proveedor controlado: se observa qué evaluación produjo cada respuesta
ok 11 - proveedor controlado: se observa qué evaluación produjo cada respuesta
  ---
  duration_ms: 11.597458
  type: 'test'
  ...
# Subtest: fallo del proveedor: el fallback conserva degraded/warnings y el query de cada presupuesto
ok 12 - fallo del proveedor: el fallback conserva degraded/warnings y el query de cada presupuesto
  ---
  duration_ms: 4.663042
  type: 'test'
  ...
# Subtest: frontera HTTP: el parser y la clave comparten la normalización; el sentinel 0 no es un presupuesto positivo
ok 13 - frontera HTTP: el parser y la clave comparten la normalización; el sentinel 0 no es un presupuesto positivo
  ---
  duration_ms: 48.919834
  type: 'test'
  ...
# Subtest: normalización única: caracterización del sentinel de presupuesto desconocido
ok 14 - normalización única: caracterización del sentinel de presupuesto desconocido
  ---
  duration_ms: 0.137375
  type: 'test'
  ...
# [env] GROWTHX_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_app: rutas /api/evaluations y sesiones
# [env] GROWTHX_WORKER_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_worker: negocio del worker bajo RLS
# [env] GROWTHX_QUEUE_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_queue: cola pg-boss del worker
# (node:37735) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/acceptance/event-validity.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: política temporal: límites, medianoche y zonas; nunca inventa zona ni fecha
ok 15 - política temporal: límites, medianoche y zonas; nunca inventa zona ni fecha
  ---
  duration_ms: 4.484542
  type: 'test'
  ...
# Subtest: demostración: con el mismo reloj solo el evento futuro supera la regla; los demás tienen motivo visible; mover el reloj lo caduca
ok 16 - demostración: con el mismo reloj solo el evento futuro supera la regla; los demás tienen motivo visible; mover el reloj lo caduca
  ---
  duration_ms: 20.105166
  type: 'test'
  ...
# Subtest: seeds: en el reloj congelado ningún evento vencido se cita como «upcoming»; los seeds no se tocan
ok 17 - seeds: en el reloj congelado ningún evento vencido se cita como «upcoming»; los seeds no se tocan
  ---
  duration_ms: 29.9035
  type: 'test'
  ...
# Subtest: adaptador: fecha ausente queda pendiente (nunca new Date()) y un evento vencido no se proyecta como próximo evento
ok 18 - adaptador: fecha ausente queda pendiente (nunca new Date()) y un evento vencido no se proyecta como próximo evento
  ---
  duration_ms: 2.697833
  type: 'test'
  ...
# Subtest: Exa: un recap vencido no se cita como listing vivo; su publicación reciente no lo rejuvenece
ok 19 - Exa: un recap vencido no se cita como listing vivo; su publicación reciente no lo rejuvenece
  ---
  duration_ms: 131.677417
  type: 'test'
  ...
# Subtest: predicado O4.1: detecta el defecto v0 sobre la captura congelada aunque cambien las citas disponibles, y verifica la corrección de 05
ok 20 - predicado O4.1: detecta el defecto v0 sobre la captura congelada aunque cambien las citas disponibles, y verifica la corrección de 05
  ---
  duration_ms: 3.704291
  type: 'test'
  ...
# Subtest: fallback del servidor sin red: el fixture histórico no vuelve como oportunidad vigente
ok 21 - fallback del servidor sin red: el fixture histórico no vuelve como oportunidad vigente
  ---
  duration_ms: 0.6615
  type: 'test'
  ...
# Subtest: fallback del cliente sin red: el fixture se identifica como histórico y no se presenta como vigente
ok 22 - fallback del cliente sin red: el fixture se identifica como histórico y no se presenta como vigente
  ---
  duration_ms: 1.236542
  type: 'test'
  ...
# [env] GROWTHX_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_app: rutas /api/evaluations y sesiones
# [env] GROWTHX_WORKER_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_worker: negocio del worker bajo RLS
# [env] GROWTHX_QUEUE_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_queue: cola pg-boss del worker
# (node:37736) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/acceptance/geographic-scope.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: fixture país: un dato de Trends sobre India sigue siendo observación de país
ok 23 - fixture país: un dato de Trends sobre India sigue siendo observación de país
  ---
  duration_ms: 56.547208
  type: 'test'
  ...
# Subtest: fixture ciudad explícita: la ubicación declarada conserva ciudad y alcance de lo declarado
ok 24 - fixture ciudad explícita: la ubicación declarada conserva ciudad y alcance de lo declarado
  ---
  duration_ms: 2.40125
  type: 'test'
  ...
# Subtest: fixture ciudad solo en la query: Exa no copia la ciudad de la consulta al resultado
ok 25 - fixture ciudad solo en la query: Exa no copia la ciudad de la consulta al resultado
  ---
  duration_ms: 135.172834
  type: 'test'
  ...
# [env] GEMINI_API_KEY falta (modo degradado) — razonamiento y decisión explicable con Gemini (structured output)
# [env] GROWTHX_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_app: rutas /api/evaluations y sesiones
# [env] GROWTHX_WORKER_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_worker: negocio del worker bajo RLS
# [env] GROWTHX_QUEUE_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_queue: cola pg-boss del worker
# (node:37737) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/acceptance/llm-rank-authority.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: el contrato de salida útil y las instrucciones de Gemini no piden rank; una decisión sin rank se aplica igual
ok 26 - el contrato de salida útil y las instrucciones de Gemini no piden rank; una decisión sin rank se aplica igual
  ---
  duration_ms: 134.2985
  type: 'test'
  ...
# Subtest: grabación adversarial (rank invertido, candidato desconocido, campo score): el orden visible y el rail siguen al scorer (O5)
ok 27 - grabación adversarial (rank invertido, candidato desconocido, campo score): el orden visible y el rail siguen al scorer (O5)
  ---
  duration_ms: 27.37625
  type: 'test'
  ...
# Subtest: candidatos repetidos, omitidos y con campos de score no crean oportunidades, no pierden las válidas y no cambian posiciones; una segunda redacción tampoco
ok 28 - candidatos repetidos, omitidos y con campos de score no crean oportunidades, no pierden las válidas y no cambian posiciones; una segunda redacción tampoco
  ---
  duration_ms: 1.373
  type: 'test'
  ...
# Subtest: desempate determinístico del ranking mundial: señales empatadas en distinto orden de llegada dan el mismo orden oficial (decide el id estable)
ok 29 - desempate determinístico del ranking mundial: señales empatadas en distinto orden de llegada dan el mismo orden oficial (decide el id estable)
  ---
  duration_ms: 1.395666
  type: 'test'
  ...
# Subtest: desempate determinístico del pipeline local: candidatos espejo empatados conservan el mismo orden ante grafos en distinto orden
ok 30 - desempate determinístico del pipeline local: candidatos espejo empatados conservan el mismo orden ante grafos en distinto orden
  ---
  duration_ms: 2.501458
  type: 'test'
  ...
# Subtest: ausencia de modelo: orden idéntico con redacción degradada declarada; la proyección completa del rail coincide, no solo los números
ok 31 - ausencia de modelo: orden idéntico con redacción degradada declarada; la proyección completa del rail coincide, no solo los números
  ---
  duration_ms: 2.90775
  type: 'test'
  ...
# [env] GROWTHX_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_app: rutas /api/evaluations y sesiones
# [env] GROWTHX_WORKER_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_worker: negocio del worker bajo RLS
# [env] GROWTHX_QUEUE_DATABASE_URL falta (modo degradado) — PostgreSQL rol growthx_queue: cola pg-boss del worker
# (node:37738) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/acceptance/reasoning-support.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: cita inexistente: la narrativa no se publica ni se «arreglan» sus citas; vuelve la explicación determinística con advertencia (O4.1)
ok 32 - cita inexistente: la narrativa no se publica ni se «arreglan» sus citas; vuelve la explicación determinística con advertencia (O4.1)
  ---
  duration_ms: 118.500583
  type: 'test'
  ...
# Subtest: cita ajena: evidencia real de otra oportunidad no respalda la narrativa; se rechaza entera (O4.2)
ok 33 - cita ajena: evidencia real de otra oportunidad no respalda la narrativa; se rechaza entera (O4.2)
  ---
  duration_ms: 0.457833
  type: 'test'
  ...
# Subtest: cita real irrelevante: un id propio existente no publica la cifra; la salida factual son los hechos admitidos y el modelo solo selecciona (O4.3 + salida válida)
ok 34 - cita real irrelevante: un id propio existente no publica la cifra; la salida factual son los hechos admitidos y el modelo solo selecciona (O4.3 + salida válida)
  ---
  duration_ms: 18.971833
  type: 'test'
  ...
# Subtest: afirmación contradictoria: con cita propia válida, el texto libre que contradice el hecho admitido no se publica
ok 35 - afirmación contradictoria: con cita propia válida, el texto libre que contradice el hecho admitido no se publica
  ---
  duration_ms: 0.715542
  type: 'test'
  ...
# Subtest: propuestas de acción: cifras inventadas (costo/audiencia) se retienen; sin citas la decisión entera se rechaza
ok 36 - propuestas de acción: cifras inventadas (costo/audiencia) se retienen; sin citas la decisión entera se rechaza
  ---
  duration_ms: 0.778542
  type: 'test'
  ...
# Subtest: fallo de modelo (HTTP 503): degradación explícita sin cambiar ranking ni elegibilidad
ok 37 - fallo de modelo (HTTP 503): degradación explícita sin cambiar ranking ni elegibilidad
  ---
  duration_ms: 2.686958
  type: 'test'
  ...
# Subtest: JSON inválido y timeout: misma degradación explícita, ranking y elegibilidad intactos
ok 38 - JSON inválido y timeout: misma degradación explícita, ranking y elegibilidad intactos
  ---
  duration_ms: 0.820042
  type: 'test'
  ...
# Subtest: descripción con instrucciones de ignorar evidencias: todo rechazado = degradación explícita; el ranking no cambia
ok 39 - descripción con instrucciones de ignorar evidencias: todo rechazado = degradación explícita; el ranking no cambia
  ---
  duration_ms: 0.724083
  type: 'test'
  ...
# Subtest: auditoría: una razón con citas irresolubles o sin citas no se publica; una respuesta coherente pasa intacta
ok 40 - auditoría: una razón con citas irresolubles o sin citas no se publica; una respuesta coherente pasa intacta
  ---
  duration_ms: 0.745208
  type: 'test'
  ...
# (node:37739) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/atlas/arcs.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: origen: ubicación del usuario si existe, si no San Francisco
ok 41 - origen: ubicación del usuario si existe, si no San Francisco
  ---
  duration_ms: 1.733334
  type: 'test'
  ...
# Subtest: path = bézier cuadrática "M x0 y0Q cx cy x1 y1", redondeada a 1 decimal
ok 42 - path = bézier cuadrática "M x0 y0Q cx cy x1 y1", redondeada a 1 decimal
  ---
  duration_ms: 0.409459
  type: 'test'
  ...
# Subtest: el arco siempre se comba hacia el norte, independientemente del sentido
ok 43 - el arco siempre se comba hacia el norte, independientemente del sentido
  ---
  duration_ms: 0.293959
  type: 'test'
  ...
# Subtest: bulge clampeado a [12, 60]
ok 44 - bulge clampeado a [12, 60]
  ---
  duration_ms: 0.12
  type: 'test'
  ...
# Subtest: origen == destino → sin arco
ok 45 - origen == destino → sin arco
  ---
  duration_ms: 0.269709
  type: 'test'
  ...
# Subtest: determinista: mismo input → mismo output, sin depender del reloj
ok 46 - determinista: mismo input → mismo output, sin depender del reloj
  ---
  duration_ms: 0.563292
  type: 'test'
  ...
# Subtest: escalonado por rank: 950ms + 240ms por posición; el cometa arranca al terminar el arco
ok 47 - escalonado por rank: 950ms + 240ms por posición; el cometa arranca al terminar el arco
  ---
  duration_ms: 0.2765
  type: 'test'
  ...
# Subtest: todos los arcos parten del origen
ok 48 - todos los arcos parten del origen
  ---
  duration_ms: 0.14025
  type: 'test'
  ...
# (node:37740) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/connectors/apify.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: runs an Actor with server-side auth and reads its dataset
ok 49 - runs an Actor with server-side auth and reads its dataset
  ---
  duration_ms: 135.980542
  type: 'test'
  ...
# Subtest: degrades without exposing or requiring a token
ok 50 - degrades without exposing or requiring a token
  ---
  duration_ms: 0.253792
  type: 'test'
  ...
# Subtest: keeps partial dataset items when an Actor exceeds its wait budget
ok 51 - keeps partial dataset items when an Actor exceeds its wait budget
  ---
  duration_ms: 27.150083
  type: 'test'
  ...
# (node:37741) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/contracts/evaluation.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: payload válido: el bundle incompleto pero bien formado pasa entero y sin mutaciones
ok 52 - payload válido: el bundle incompleto pero bien formado pasa entero y sin mutaciones
  ---
  duration_ms: 43.597333
  type: 'test'
  ...
# Subtest: payload inválido se rechaza con ruta y motivo; las claves desconocidas no se ignoran
ok 53 - payload inválido se rechaza con ruta y motivo; las claves desconocidas no se ignoran
  ---
  duration_ms: 0.919208
  type: 'test'
  ...
# Subtest: una versión de contrato desconocida se rechaza; no se interpreta como la actual
ok 54 - una versión de contrato desconocida se rechaza; no se interpreta como la actual
  ---
  duration_ms: 0.482041
  type: 'test'
  ...
# Subtest: fecha incierta se conserva incierta: ni zona inventada ni fecha de hoy
ok 55 - fecha incierta se conserva incierta: ni zona inventada ni fecha de hoy
  ---
  duration_ms: 1.805041
  type: 'test'
  ...
# Subtest: costo incompleto: la partida pendiente viaja como pendiente y no existe un total
ok 56 - costo incompleto: la partida pendiente viaja como pendiente y no existe un total
  ---
  duration_ms: 0.7795
  type: 'test'
  ...
# Subtest: una localización nacional no coloca el evento en una ciudad ni en el mapa
ok 57 - una localización nacional no coloca el evento en una ciudad ni en el mapa
  ---
  duration_ms: 1.13325
  type: 'test'
  ...
# Subtest: una contradicción viaja como contradicción, con su motivo visible
ok 58 - una contradicción viaja como contradicción, con su motivo visible
  ---
  duration_ms: 0.563417
  type: 'test'
  ...
# Subtest: score ausente se distingue de cero; «sin evento elegible» se distingue de error técnico
ok 59 - score ausente se distingue de cero; «sin evento elegible» se distingue de error técnico
  ---
  duration_ms: 1.702666
  type: 'test'
  ...
# Subtest: un compromiso acordado sin soporte se rechaza; una estimación no se disfraza de acuerdo
ok 60 - un compromiso acordado sin soporte se rechaza; una estimación no se disfraza de acuerdo
  ---
  duration_ms: 50.408291
  type: 'test'
  ...
# Subtest: identidades separadas: aliases exigen confirmación con soporte y un logo no crea patrocinio ni resultados
ok 61 - identidades separadas: aliases exigen confirmación con soporte y un logo no crea patrocinio ni resultados
  ---
  duration_ms: 5.131875
  type: 'test'
  ...
# Subtest: la decisión exige autor del servidor, motivos y relación de revisión coherente
ok 62 - la decisión exige autor del servidor, motivos y relación de revisión coherente
  ---
  duration_ms: 0.693708
  type: 'test'
  ...
# Subtest: las reglas de objeto no comprueban integridad relacional (eso es 08/09)
ok 63 - las reglas de objeto no comprueban integridad relacional (eso es 08/09)
  ---
  duration_ms: 1.68075
  type: 'test'
  ...
# Subtest: round-trip por JSON: serializar, releer y validar conserva el agregado idéntico
ok 64 - round-trip por JSON: serializar, releer y validar conserva el agregado idéntico
  ---
  duration_ms: 1.326708
  type: 'test'
  ...
# Subtest: la proyección conserva pendientes sin los defaults engañosos del contrato legado
ok 65 - la proyección conserva pendientes sin los defaults engañosos del contrato legado
  ---
  duration_ms: 0.392541
  type: 'test'
  ...
# (node:37742) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/graph/derive-signals.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: derives query-specific capabilities instead of requiring a static topics file
ok 66 - derives query-specific capabilities instead of requiring a static topics file
  ---
  duration_ms: 2.345416
  type: 'test'
  ...
# Subtest: distance is context in miles and can be computed independently from score
ok 67 - distance is context in miles and can be computed independently from score
  ---
  duration_ms: 0.180792
  type: 'test'
  ...
# (node:37743) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/integration/curated-dossier.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: curated-manifest: parseo estricto del manifiesto de curación
    # Subtest: el manifiesto fixture valida completo
    ok 1 - el manifiesto fixture valida completo
      ---
      duration_ms: 8.593667
      type: 'test'
      ...
    # Subtest: clave desconocida y responsable ausente se rechazan
    ok 2 - clave desconocida y responsable ausente se rechazan
      ---
      duration_ms: 1.752083
      type: 'test'
      ...
    # Subtest: extracto sobredimensionado y claim de perfil se rechazan
    ok 3 - extracto sobredimensionado y claim de perfil se rechazan
      ---
      duration_ms: 83.225084
      type: 'test'
      ...
    # Subtest: la versión desconocida no se interpreta como la actual
    ok 4 - la versión desconocida no se interpreta como la actual
      ---
      duration_ms: 0.612459
      type: 'test'
      ...
    1..4
ok 68 - curated-manifest: parseo estricto del manifiesto de curación
  ---
  duration_ms: 95.460459
  type: 'test'
  ...
# Subtest: curated-dossier: catálogo curado y dossiers persistidos (PostgreSQL real)
    # Subtest: carga autorizada: el manifiesto fixture entra completo bajo el tenant real
    ok 1 - carga autorizada: el manifiesto fixture entra completo bajo el tenant real
      ---
      duration_ms: 140.157042
      type: 'test'
      ...
    # Subtest: idempotencia: repetir la carga no duplica eventos ni revisiones
    ok 2 - idempotencia: repetir la carga no duplica eventos ni revisiones
      ---
      duration_ms: 8.7425
      type: 'test'
      ...
    # Subtest: fuente replicada e inmutabilidad: mismo id sin cambios pasa; con cambios se rechaza entero
    ok 3 - fuente replicada e inmutabilidad: mismo id sin cambios pasa; con cambios se rechaza entero
      ---
      duration_ms: 44.463625
      type: 'test'
      ...
    # Subtest: una corrección es una revisión NUEVA que conserva la anterior
    ok 4 - una corrección es una revisión NUEVA que conserva la anterior
      ---
      duration_ms: 36.444459
      type: 'test'
      ...
    # Subtest: rutas: sin sesión 401; id inválido 400
    ok 5 - rutas: sin sesión 401; id inválido 400
      ---
      duration_ms: 9.636542
      type: 'test'
      ...
    # Subtest: la lista del catálogo separa vigencia de promesas pendientes
    ok 6 - la lista del catálogo separa vigencia de promesas pendientes
      ---
      duration_ms: 12.788333
      type: 'test'
      ...
    # Subtest: dossier de edición: contradicción con ambas revisiones, costo pendiente y fuentes abribles
    ok 7 - dossier de edición: contradicción con ambas revisiones, costo pendiente y fuentes abribles
      ---
      duration_ms: 11.365375
      type: 'test'
      ...
    # Subtest: homónimos e independencia: identidades separadas, coorganizador sin herencia
    ok 8 - homónimos e independencia: identidades separadas, coorganizador sin herencia
      ---
      duration_ms: 40.565708
      type: 'test'
      ...
    # Subtest: participaciones: rol recorrible empresa → edición → fuente; ausencia de resultado ≠ fracaso
    ok 9 - participaciones: rol recorrible empresa → edición → fuente; ausencia de resultado ≠ fracaso
      ---
      duration_ms: 18.70175
      type: 'test'
      ...
    # Subtest: research persistido: sin catálogo → null (fixture de 08); con catálogo → candidatos vigentes
    ok 10 - research persistido: sin catálogo → null (fixture de 08); con catálogo → candidatos vigentes
      ---
      duration_ms: 38.149916
      type: 'test'
      ...
    # Subtest: tenant señuelo: catálogo vacío por RLS y referencias cruzadas rechazadas
    ok 11 - tenant señuelo: catálogo vacío por RLS y referencias cruzadas rechazadas
      ---
      duration_ms: 20.037542
      type: 'test'
      ...
    # Subtest: reloj controlado: la vigencia cambia al evaluar y el catálogo vencido se declara
    ok 12 - reloj controlado: la vigencia cambia al evaluar y el catálogo vencido se declara
      ---
      duration_ms: 17.140541
      type: 'test'
      ...
    1..12
ok 69 - curated-dossier: catálogo curado y dossiers persistidos (PostgreSQL real)
  ---
  duration_ms: 530.920958
  type: 'test'
  ...
# (node:37744) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/integration/evaluation-run.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# [env] EXA_API_KEY falta (modo degradado) — discovery live de eventos y enriquecimiento de fuentes públicas con Exa
# [env] GEMINI_API_KEY falta (modo degradado) — razonamiento y decisión explicable con Gemini (structured output)
# [env] APIFY_TOKEN falta (modo degradado) — señales mundiales de Google Trends, GitHub y X
# Subtest: evaluation-run: run durable con tenant (PostgreSQL + pg-boss reales)
    # Subtest: POST sin sesión → 401 (la sesión se valida en el servidor)
    ok 1 - POST sin sesión → 401 (la sesión se valida en el servidor)
      ---
      duration_ms: 3.928833
      type: 'test'
      ...
    # Subtest: un tenantId en el cuerpo se rechaza (no se confía en el navegador)
    ok 2 - un tenantId en el cuerpo se rechaza (no se confía en el navegador)
      ---
      duration_ms: 11.892917
      type: 'test'
      ...
    # Subtest: aceptación: 202 con run y job durable en el MISMO commit
    ok 3 - aceptación: 202 con run y job durable en el MISMO commit
      ---
      duration_ms: 34.156875
      type: 'test'
      ...
    # Subtest: atomicidad: si el encolado falla, NO queda run (ni 202 con trabajo perdido)
    ok 4 - atomicidad: si el encolado falla, NO queda run (ni 202 con trabajo perdido)
      ---
      duration_ms: 8.438541
      type: 'test'
      ...
    # Subtest: idempotencia: misma clave y mismo payload → el MISMO run
    ok 5 - idempotencia: misma clave y mismo payload → el MISMO run
      ---
      duration_ms: 4.730083
      type: 'test'
      ...
    # Subtest: idempotencia: misma clave con OTRO payload → 409
    ok 6 - idempotencia: misma clave con OTRO payload → 409
      ---
      duration_ms: 5.487416
      type: 'test'
      ...
    # Subtest: GET devuelve estado y pasos persistidos; el señuelo no ve el run
    ok 7 - GET devuelve estado y pasos persistidos; el señuelo no ve el run
      ---
      duration_ms: 16.024459
      type: 'test'
      ...
    # Subtest: RLS en SQL de aplicación: contexto señuelo o sin contexto no obtiene la fila
    ok 8 - RLS en SQL de aplicación: contexto señuelo o sin contexto no obtiene la fila
      ---
      duration_ms: 3.391208
      type: 'test'
      ...
    # Subtest: el rol que administra la cola no accede a datos de negocio
    ok 9 - el rol que administra la cola no accede a datos de negocio
      ---
      duration_ms: 14.673584
      type: 'test'
      ...
    # Subtest: reanudación básica: corte del worker tras un paso, reinicio, el MISMO run termina
    ok 10 - reanudación básica: corte del worker tras un paso, reinicio, el MISMO run termina
      ---
      duration_ms: 3390.248417
      type: 'test'
      ...
    # Subtest: lectura tras cerrar la conexión: el run sobrevive al pool que lo escribió
    ok 11 - lectura tras cerrar la conexión: el run sobrevive al pool que lo escribió
      ---
      duration_ms: 21.558125
      type: 'test'
      ...
    # Subtest: GET con id inválido → 400; run inexistente → 404
    ok 12 - GET con id inválido → 400; run inexistente → 404
      ---
      duration_ms: 9.215541
      type: 'test'
      ...
    1..12
ok 70 - evaluation-run: run durable con tenant (PostgreSQL + pg-boss reales)
  ---
  duration_ms: 3723.480208
  type: 'test'
  ...
# (node:37745) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/markets/global-market-search.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: normalizes worldwide Trends rows and explicit X locations
ok 71 - normalizes worldwide Trends rows and explicit X locations
  ---
  duration_ms: 2.117667
  type: 'test'
  ...
# Subtest: builds focused signal queries from natural product descriptions
ok 72 - builds focused signal queries from natural product descriptions
  ---
  duration_ms: 11.1605
  type: 'test'
  ...
# Subtest: ranks three countries from query-specific geographic evidence
ok 73 - ranks three countries from query-specific geographic evidence
  ---
  duration_ms: 6.354166
  type: 'test'
  ...
# Subtest: keeps a labeled worldwide fallback when every live source is unavailable
ok 74 - keeps a labeled worldwide fallback when every live source is unavailable
  ---
  duration_ms: 1.291958
  type: 'test'
  ...
# (node:37748) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/scoring/community-score.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: comunidad completa con evidencia: score alto y reasons respaldadas
ok 75 - comunidad completa con evidencia: score alto y reasons respaldadas
  ---
  duration_ms: 1.06825
  type: 'test'
  ...
# Subtest: evidencia vacía: sin reasons y confidence null (pero score se computa)
ok 76 - evidencia vacía: sin reasons y confidence null (pero score se computa)
  ---
  duration_ms: 0.423208
  type: 'test'
  ...
# Subtest: stack vacío → stackOverlap null (no 0)
ok 77 - stack vacío → stackOverlap null (no 0)
  ---
  duration_ms: 0.286333
  type: 'test'
  ...
# Subtest: sin cadencia conocida → cadenceReliability null
ok 78 - sin cadencia conocida → cadenceReliability null
  ---
  duration_ms: 0.14475
  type: 'test'
  ...
# Subtest: sin evidencia de sponsors → exclusivityGap null (no inferir ausencia)
ok 79 - sin evidencia de sponsors → exclusivityGap null (no inferir ausencia)
  ---
  duration_ms: 0.129792
  type: 'test'
  ...
# (node:37749) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/scoring/roi.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: inputs completos: costo por dev calificado + banda
ok 80 - inputs completos: costo por dev calificado + banda
  ---
  duration_ms: 1.273333
  type: 'test'
  ...
# Subtest: falta el precio del tier → null + "No disponible" (nunca se estima el precio)
ok 81 - falta el precio del tier → null + "No disponible" (nunca se estima el precio)
  ---
  duration_ms: 0.117959
  type: 'test'
  ...
# Subtest: falta icpFitRate → null + "No disponible"
ok 82 - falta icpFitRate → null + "No disponible"
  ---
  duration_ms: 0.100625
  type: 'test'
  ...
# Subtest: attendance 0 → null (no dividir por cero)
ok 83 - attendance 0 → null (no dividir por cero)
  ---
  duration_ms: 0.175458
  type: 'test'
  ...
# (node:37750) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/scoring/score-utils.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: renormaliza sobre las dimensiones activas: una sola dim activa = 100
ok 84 - renormaliza sobre las dimensiones activas: una sola dim activa = 100
  ---
  duration_ms: 0.878542
  type: 'test'
  ...
# Subtest: null NUNCA es 0: null y 0 dan scores distintos
ok 85 - null NUNCA es 0: null y 0 dan scores distintos
  ---
  duration_ms: 0.362666
  type: 'test'
  ...
# Subtest: todas las dimensiones null → score 0
ok 86 - todas las dimensiones null → score 0
  ---
  duration_ms: 0.169375
  type: 'test'
  ...
# Subtest: coverageRatio: fracción del target cubierta, null si falta un conjunto
ok 87 - coverageRatio: fracción del target cubierta, null si falta un conjunto
  ---
  duration_ms: 0.243875
  type: 'test'
  ...
# Subtest: clamp01 acota a [0,1]
ok 88 - clamp01 acota a [0,1]
  ---
  duration_ms: 0.300375
  type: 'test'
  ...
# (node:37751) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/scoring/theme-score.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: momentum: ratio 2.0 (+100%) → 1.0
ok 89 - momentum: ratio 2.0 (+100%) → 1.0
  ---
  duration_ms: 0.972042
  type: 'test'
  ...
# Subtest: sin githubMomentum cae a newsSalience
ok 90 - sin githubMomentum cae a newsSalience
  ---
  duration_ms: 0.147708
  type: 'test'
  ...
# Subtest: sin requiredCapabilities → criticalPath null
ok 91 - sin requiredCapabilities → criticalPath null
  ---
  duration_ms: 0.192417
  type: 'test'
  ...
# Subtest: reasons del tema citan evidencia no vacía
ok 92 - reasons del tema citan evidencia no vacía
  ---
  duration_ms: 0.168916
  type: 'test'
  ...
1..92
# tests 120
# suites 0
# pass 120
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5159.368
TAP version 13
# (node:37809) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/jirustaroure/Desktop/GrowthX%20for%20hackaton/frontend/tests/e2e/sf-organizer-research.spec.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: SF: dashboard y organizadores con navegador, PostgreSQL y worker reales
    # Subtest: entrada dashboard, sesión y perfil corregible antes de investigar
    ok 1 - entrada dashboard, sesión y perfil corregible antes de investigar
      ---
      duration_ms: 6585.591042
      type: 'test'
      ...
    # Subtest: homónimos independientes y guardado durable sin edición elegible
    ok 2 - homónimos independientes y guardado durable sin edición elegible
      ---
      duration_ms: 1259.589875
      type: 'test'
      ...
    # Subtest: razones → expediente → empresa → edición → rol → fuente; resultado desconocido
    ok 3 - razones → expediente → empresa → edición → rol → fuente; resultado desconocido
      ---
      duration_ms: 141.45575
      type: 'test'
      ...
    # Subtest: logo ambiguo y edición futura fuera de SF no se recomiendan
    ok 4 - logo ambiguo y edición futura fuera de SF no se recomiendan
      ---
      duration_ms: 48.197667
      type: 'test'
      ...
    # Subtest: Lista/Mapa conservan exactamente los mismos IDs y fuentes; sin sede inferida
    ok 5 - Lista/Mapa conservan exactamente los mismos IDs y fuentes; sin sede inferida
      ---
      duration_ms: 130.308292
      type: 'test'
      ...
    # Subtest: revisión del perfil, ausencia de coincidencia e importador disponible
    ok 6 - revisión del perfil, ausencia de coincidencia e importador disponible
      ---
      duration_ms: 1793.693417
      type: 'test'
      ...
    # Subtest: sesión señuelo, RLS, identidad comparable e idempotencia de nuevas revisiones
    ok 7 - sesión señuelo, RLS, identidad comparable e idempotencia de nuevas revisiones
      ---
      duration_ms: 253.907
      type: 'test'
      ...
    # Subtest: matching usa la última revisión y la identidad confirmada, no nombres parecidos
    ok 8 - matching usa la última revisión y la identidad confirmada, no nombres parecidos
      ---
      duration_ms: 1029.007292
      type: 'test'
      ...
    # Subtest: error del worker se persiste y aparece en el dashboard
    ok 9 - error del worker se persiste y aparece en el dashboard
      ---
      duration_ms: 8725.158709
      type: 'test'
      ...
    # Subtest: sin catálogo no hay fixtures de relleno; cero llamadas al pipeline global
    ok 10 - sin catálogo no hay fixtures de relleno; cero llamadas al pipeline global
      ---
      duration_ms: 200.942333
      type: 'test'
      ...
    1..10
ok 1 - SF: dashboard y organizadores con navegador, PostgreSQL y worker reales
  ---
  duration_ms: 25184.886042
  type: 'test'
  ...
# Next real y worker real; 0 llamadas al pipeline global. Catálogo sintético explícito.
1..1
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 25547.250375
```

</details>

### Salida real de `pnpm --dir frontend lint`

```text
$ eslint .
```

Exit code: 0.
