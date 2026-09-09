# 12 — Persistir la comparación y su snapshot oficial

Status: ready-for-human

**Estado:** implementado con autorización explícita de Julian (2026-09-09; la autorización reemplaza los avisos de «no autorizado» de los docs y cubre solo este ticket); listo para revisión humana. Ver `## Comments`.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [10](./10-dashboard-sf-y-organizadores.md).

## Objetivo

Comparar hasta tres eventos con elegibilidad previa al score y guardar un snapshot reproducible cuyo orden y hechos no dependen del modelo.

## Aristas de bloqueo

10 → 12: necesita perfil y selección de candidatos desde el dashboard con expedientes. No depende de 11: se demuestra con catálogo curado; Luma usa el mismo evaluador.

## Criterios de aceptación

- [x] Los candidatos se evalúan contra la misma revisión del perfil, instante y política. Se guardan revisiones de evento/claim y features usadas, incluida la razón de cada dato ausente.
- [x] Un conflicto confirmado de fecha, acceso o presupuesto excluye antes del score; datos insuficientes generan condiciones pendientes. Un puntaje alto no habilita un evento excluido y un costo desconocido no cuenta como cero.
- [x] Se distingue el catálogo disponible —2–5— del conjunto comparado —hasta tres—. Con menos opciones elegibles no se inventan candidatos para completar un top 3.
- [x] Con política aprobada, el scorer determinístico versionado produce orden, desempate, `S_known`, `Q` y sensibilidad a faltantes. Sin política aplicable, se persiste comparación factual sin ranking numérico y con «política pendiente». Elegible no significa automáticamente recomendado.
- [x] El snapshot oficial inmutable se confirma antes de pedir redacción. La salida del adaptador de modelo se guarda separada y validada contra claims del snapshot; no altera orden, score, eligibility ni condiciones.
- [x] El adaptador usa API directa y un presupuesto acotado de llamadas/tiempo con fallback determinístico; no agrega tools de discovery. Se registra modelo, versión de prompt, duración, uso/costo disponible y motivo de rechazo o degradación.
- [x] La UI muestra por candidato «descartado por restricción», «condicionado» o «elegible», fuentes y qué respuesta resolvería cada pendiente. No muestra consenso como confidence ni convierte cobertura en probabilidad de éxito.
- [x] Se compara v1 con la referencia v0 en modo sombra, offline y sobre entradas compatibles. Si v0 carece de evento o evalúa otra unidad/objetivo, se registra «no comparable»; sus scores no se reutilizan para llenar v1.

## Criterios de decisión en SF

- [x] Seleccionar un organizador para investigar no elige una inversión: se exige una edición futura y modalidad concretas para recomendar gasto.
- [x] La edición elegible está en SF con ubicación respaldada. Un antecedente de otra ciudad no satisface esa regla.
- [x] Se fijan revisiones de organizador y relación empresa/edición junto a los claims del evento. No hay un score universal de reputación ni resultado inferido desde una participación.
- [x] El test incluye un organizador pertinente sin evento futuro y otro con una edición en otra ciudad: ambos pueden investigarse, ninguno se publica como inversión elegible en SF.

## Demostración

Comparar un candidato excluido, otro condicionado y uno elegible; inyectar un modelo que intenta invertirlos o inventar audiencia. Abrir el snapshot persistido y comprobar que conserva el resultado oficial y la advertencia. Repetir sin política: se obtiene comparación factual sin score.

## Módulos y archivos probablemente afectados

`frontend/lib/server/scoring/score-utils.ts`, `frontend/lib/server/reasoning/gemini.ts`, `frontend/lib/api/opportunity-adapter.ts`, `frontend/components/atlas/result-rail.tsx`, `frontend/components/atlas/opportunity-drawer.tsx`, `frontend/components/atlas/confidence-bars.tsx`.
Nuevos previstos: `frontend/lib/server/evaluations/eligibility.ts`, política de scoring v1, adaptador de modelo, repositorio de snapshots y `frontend/tests/integration/evaluation-snapshot.test.ts`.

## Qué test lo demuestra

`evaluation-snapshot.test.ts` usa PostgreSQL real y una política ficticia explícita de test: exclusión antes del scorer, score con faltantes, abstención, ausencia de política, desempate, snapshot inmutable y modelo sin autoridad. Guardar y volver a leer debe recuperar las mismas entradas/versiones y resultado. Las invariantes 03–06 se aplican también a la nueva proyección.

## Decisiones abiertas

**DECISIÓN ABIERTA D1/D2:** objetivo comprado y política aplicable. Los pesos de test no se despliegan como política comercial. Se puede cerrar la comparación factual y la decisión condicional sin score; publicar ranking de inversión espera aprobación de esa política.

## Comments

Implementado el 2026-09-09. Sin commit ni push (los hace Julian). Autorización explícita de Julian: cambio a `ready-for-agent` antes de empezar y, vía AskUserQuestion, el alcance ampliado «Todo: A + B + migración» — (A) `wire.ts`/`service.ts`/`run-worker.ts`, (B) `atlas-client.ts` + `research-dashboard.tsx` + `comparison-panel.tsx` nuevo, más la migración `005` y los módulos nuevos en `lib/server/evaluations/`.

### Qué se hizo

- **Aceptación durable** — `POST /api/evaluations` acepta `mode: 'investment_comparison'` por la MISMA frontera (`wire.ts`: parseo estricto, conjunto normalizado sin duplicados, 1–3 ediciones; `service.ts › acceptComparison`): reutiliza el perfil de una investigación existente (`profileRunId` — misma revisión del perfil para todos los candidatos), valida bajo RLS que cada edición exista en el catálogo del tenant (no se inventan candidatos), e inserta run + 4 steps + job pg-boss en UNA transacción con la idempotencia de siempre (mismo conjunto en otro orden = duplicado; otro conjunto con la misma clave = 409). `app/api/evaluations/route.ts` y `[id]/route.ts` quedaron SIN cambios.
- **Workflow `investment-comparison/1`** (`compare.ts`, corre en el worker): `validate_profile → evaluate_candidates → compose_narrative → publish_result`.
  - `evaluate_candidates` (determinístico): un solo instante de evaluación para todos los candidatos; catálogo disponible leído al mismo instante y registrado APARTE del conjunto comparado; elegibilidad ANTES del score (`eligibility.ts`); features con la razón de cada dato ausente (`scoring-policy.ts › extractFeatures`, set `features/1`); política aplicable o su ausencia; sombra v0 offline; y el **snapshot oficial inmutable confirmado acá, antes de pedir redacción alguna** (`snapshot-store.ts`). Reentrega del job: devuelve el snapshot confirmado, jamás lo duplica ni lo reescribe.
  - `compose_narrative`: adaptador de modelo (`model-adapter.ts`) SOBRE el snapshot ya persistido; su registro va a `snapshot_narratives`, separado.
  - `publish_result`: `runs.result` se compone RELEYENDO snapshot + narrativa de PostgreSQL (bundle del contrato 07 + companions + advertencias).
- **`eligibility.ts` (nuevo previsto):** conflicto CONFIRMADO excluye antes del score — fecha vencida (política temporal de 04, bajo cualquier zona), fecha declarada fuera de la ventana del perfil, partida con soporte que excede el presupuesto declarado, acceso documentado que coincide con una restricción del perfil, y ciudad respaldada distinta de SF (criterio SF: un antecedente de otra ciudad no satisface la regla; sigue investigable). Datos insuficientes NO excluyen: generan `PendingCondition` con `resolution` (qué respuesta la resolvería) — fecha ambigua/pendiente, ciudad sin fuente urbana, acceso sin soporte, costo desconocido (jamás 0), presupuesto no declarado, audiencia contradicha. Todo candidato lleva la nota fija «elegible no significa recomendado» (recomendar gasto exige edición futura y modalidad concretas — tickets 13+).
- **`scoring-policy.ts` (política de scoring v1):** `ScoringPolicy` versionada con `approval` explícito; `approvedPolicyFor()` devuelve **null para todo objetivo (D2)** — la política ficticia vive SOLO en el test, marcada `test_only`. `applyScoringPolicy` produce `S_known` (renormalizado sobre dimensiones activas, `weightedScore` de `score-utils.ts`; null nunca es 0), `Q` (nuevo `activeWeightFraction` en `score-utils.ts`), desempate determinístico por id estable ante empate exacto (misma convención que 06), nota de sensibilidad a faltantes (rango peor/mejor caso y con qué vecino podría invertirse el orden) y **abstención** (`insufficient_data`) cuando ninguna dimensión tiene dato.
- **`model-adapter.ts` (adaptador de modelo):** API directa de Gemini (`fetch` inyectable), presupuesto acotado (1 llamada, timeout 15 s), sin tools de discovery; entrada = SOLO claims fijados por el snapshot. Cita inexistente, ajena a la alternativa o ausente → salida rechazada ENTERA (sin filtrar ni sustituir citas); cifra sin respaldo literal en los claims citados → propuesta retenida con nota; `rank`/`score`/`eligibility`/candidatos desconocidos que el modelo devuelva → descartados y REGISTRADOS como intento sin autoridad. Registra modelo, `promptVersion` (`comparison-narrative/1`), duración, uso (tokens) y motivo de rechazo/degradación. Cualquier fallo (sin clave, HTTP, JSON inválido, timeout) → `deterministic_only` sin tocar nada.
- **`snapshot-store.ts` (repositorio de snapshots) + migración `005-comparacion-y-snapshot.sql`:** tablas `growthx.snapshots` (payload = `EvaluationSnapshot` del contrato 07 validado en escritura y relectura, con `narrative` null obligatorio al confirmar + columnas companion `features`/`v0_shadow`/`available_catalog`) y `growthx.snapshot_narratives` (≤1 por snapshot; reentrega reutiliza). **Inmutabilidad por grants**: ni `growthx_app` ni `growthx_worker` tienen UPDATE/DELETE (probado). RLS enable+force, FKs compuestas por tenant. `buildReadBundle` relee las revisiones EXACTAS fijadas (claims/organizadores/ediciones/participaciones/fuentes/empresas) revalidando contratos. La migración también agrega el modo `investment_comparison` al check de `runs.mode`.
- **Sombra v0** (`compare.ts › shadowCompareWithV0` + `loadFrozenV0Reference`): offline contra la referencia CONGELADA de 01 (`characterization.json › local`, pipeline sobre seeds; nada se re-graba ni se consulta afuera). Match por nombre → «no comparable» con motivo «unidad community/market y objetivo v0 distintos», con el score v0 visible SOLO dentro del registro de sombra; sin match → «v0 no evaluó este evento»; sin referencia → se declara. Ningún score v0 llena campos de v1 (asertado).
- **UI** — `comparison-panel.tsx` (nuevo) proyectado por `opportunity-adapter.ts › projectComparisonResult` (reusa `projectEvaluationRead` de 07): por candidato «Descartado por restricción» / «Condicionado» / «Elegible», motivos de exclusión, condiciones con **qué respuesta las resolvería**, campos con fuentes (`SourceRecordLinks` vía `ReasonSources`), features con razón de ausencia, score solo con política (o «política pendiente»), lectura del modelo como registro aparte y sombra v0. `confidence-bars.tsx` suma `CoverageBar`: la cobertura Q con label explícito «no es probabilidad de éxito» (y el consenso sigue en su barra separada, nunca fusionado). `research-dashboard.tsx`: checkboxes en Eventos (hasta 3, con tope), botón «Comparar seleccionadas», labels de los steps nuevos y montaje del panel al recuperar el run (`?run=`). `atlas-client.ts`: `startComparison`, `comparisonResult(run)` y tipos espejo.

### Qué test lo demuestra

`frontend/tests/integration/evaluation-snapshot.test.ts` — 14 subtests contra PostgreSQL REAL (sin base se salta con aviso), catálogo sintético propio (6 ediciones: elegible / condicionada / sobre-presupuesto / Berlín / vencida / opaca de alcance país) y política ficticia `test_only`: frontera HTTP (401/400/409, tenantId rechazado, 4 steps + job en el commit, idempotencia por conjunto); exclusión antes del score (presupuesto, fecha, otra ciudad) con costo desconocido ≠ 0; scorer (S_known 65 exacto, Q, sensibilidad nombrando dimensiones faltantes, score CON faltantes renormalizado); desempate por id estable en ambos órdenes de llegada; modelo adversarial (rank/score invertidos descartados y registrados, cifra «500» retenida con advertencia persistida, cita ajena → rechazo entero, defensa del repositorio) con el snapshot releído idéntico byte a byte estructural; inmutabilidad (UPDATE/DELETE → permission denied con ambos roles; reentrega con otro reloj → mismo snapshot, count 1); catálogo disponible (6/5 vigentes) vs comparado (3); sombra v0 (match → «no comparable» sin reutilizar el 61; sin match; sin referencia; loader real del archivo congelado); sin política → factual con «política pendiente» y criterios SF (Berlín y vencida excluidas; organizador pertinente sin evento futuro investigable, nada suyo elegible); abstención `insufficient_data` (jamás 0) + fallo HTTP 503 del adaptador → degradación; guardar y releer desde una conexión nueva (mismas revisiones/versiones y resultado `deepEqual` con `runs.result`); invariantes 03–06 sobre la proyección (orden = snapshot, fecha = la declarada, país no se vuelve ciudad ni punto, Q como fracción con su política, fuentes visibles); conflicto de acceso confirmado (regla pura); tenant señuelo (RLS en accept y en SQL).

Verificación de navegador manual con Playwright (no versionada, misma decisión que 08–11): dev server real (:3210) + worker real + sesión dev; perfil → Eventos → selección 3/3 con tope → «Comparar seleccionadas» → panel con snapshot persistido, «política pendiente», estados por candidato (Descartado/Condicionado/Condicionado sobre el fixture de 09), condiciones con respuesta, «elegible no significa recomendado», sombra v0 declarada y degradación real sin `GEMINI_API_KEY`; recarga con `?run=` recupera el MISMO snapshot; **0 llamadas al pipeline global**. 12/12 checks; capturas revisadas.

### Salida real de verificación

```text
$ pnpm --dir frontend test        (exit 0)
# tests 148      # tests 11        ← suite node --test + e2e
# pass 148       # pass 11
# fail 0         # fail 0
# cancelled 0    # cancelled 0
# skipped 0      # skipped 0
(133 previos + 15 nuevos de evaluation-snapshot.test.ts; e2e 11/11)

$ pnpm --dir frontend lint        (exit 0)
$ eslint .
(sin errores ni warnings)

$ npx tsc --noEmit --incremental false   (exit 0)
$ pnpm --dir frontend build              (OK; rutas sin cambios)
$ pnpm --dir frontend test:baseline      (8/8; O1–O5 «corregido», sin INESPERADO;
  el drift esperado suma solo lib/server/scoring/score-utils.ts)
```

### Desvíos y límites documentados

- **Alcance autorizado en sesión** (AskUserQuestion, opción «Todo»): además de los archivos del ticket, `wire.ts`, `service.ts`, `run-worker.ts`, `db/migrations/005-comparacion-y-snapshot.sql`, `lib/api/atlas-client.ts`, `components/research-dashboard/research-dashboard.tsx` y el nuevo `components/research-dashboard/comparison-panel.tsx`. Los módulos nuevos sin ruta fija quedaron en `lib/server/evaluations/` (`eligibility.ts`, `scoring-policy.ts`, `model-adapter.ts`, `snapshot-store.ts`, `compare.ts`).
- **Listados como probables y NO tocados:** `lib/server/reasoning/gemini.ts` (la frontera v0 no cambia; el adaptador nuevo es un módulo aparte con las mismas reglas de autoridad), `result-rail.tsx` y `opportunity-drawer.tsx` (siguen siendo la vista v0; la comparación vive en el dashboard de 10). `score-utils.ts` solo suma `activeWeightFraction` (aditivo; baseline sin INESPERADO).
- **Contratos de 07 sin cambios:** features/sombra v0/catálogo disponible se persisten como columnas companion junto al payload del snapshot (los contratos están cerrados; agregarles campos sería un cambio de contrato explícito). El `EvaluationSnapshot` persistido valida contra el contrato tal cual, con `narrative: null` (la redacción vive en `snapshot_narratives`).
- **D1/D2 intactas:** `approvedPolicyFor` devuelve null para todo objetivo; en producción TODA comparación sale «política pendiente», factual y sin ranking (verificado en navegador). Los pesos del test (`pol-cmp-ficticia`, `approval: test_only`) no se despliegan.
- **El conflicto de acceso confirmado** se prueba con la regla pura (`evaluateEligibility` con `restrictions`): el intake actual no captura restricciones de perfil (siempre `[]`), así que ese camino no es alcanzable por HTTP todavía.
- **Historial del Resumen:** sigue listando solo runs `sf-organizers/1` (límite ya documentado en 11); un run de comparación se recupera por `?run=` y su panel se monta al abrirlo.
- **Infra local:** la migración 005 quedó aplicada al contenedor `growthx-postgres`. La verificación de navegador dejó en el tenant `growthx-dev` un run de investigación y uno de comparación con su snapshot (inocuos, borrables) y `db:seed-dev` rotó el token de la sesión dev. No quedó ningún proceso corriendo; si tenías un `next dev` propio abierto durante la sesión, puede haber sido cerrado por la limpieza (relanzalo con `growthx-frontend` de `.claude/launch.json`).
- **Higiene de cola:** los jobs que el test acepta se cancelan de inmediato (los steps corren in-process con deps inyectadas); el test también cancela huérfanos previos de sus propios tenants `it-cmp-%`.
