# 13 — Guardar una decisión condicional y su campaña en borrador

Status: ready-for-human

**Estado:** implementado con autorización explícita de Julian (2026-09-09; la autorización reemplaza los avisos de «no autorizado» y cubre solo este ticket); listo para revisión humana. Ver `## Comments`.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [12](./12-comparacion-y-snapshot-oficial.md).

## Objetivo

Permitir elegir, descartar o dejar pendiente un evento desde el panel actual y persistir motivos, condiciones y el borrador mínimo de campaña de forma atómica.

## Aristas de bloqueo

12 → 13: una decisión humana debe referenciar un snapshot oficial existente, con sus condiciones y revisiones de evidencia.

## Criterios de aceptación

- [x] El panel ofrece elegir/descartar/pendiente con motivos obligatorios; permite registrar razones distintas para alternativas distintas sin tratarlas como resultados observados.
- [x] Una elección con acceso, audiencia o costo pendientes se guarda como condicional. Guardar un organizador sin evento concreto conserva una investigación; no crea una inversión ni campaña. Un evento excluido por una restricción confirmada no se convierte en elección viable mediante un click; corregir el dato requiere nueva evidencia/evaluación.
- [x] Cada condición guarda la pregunta al organizador, claim o dato pendiente, respuesta esperada y efecto sobre la decisión, responsable y plazo si se conocen. No se envía ningún mensaje.
- [x] `POST /api/decisions` guarda la decisión contra el snapshot; `PATCH /api/decisions/:id` agrega revisiones mediante revisión esperada. Dos pestañas no sobrescriben silenciosamente los motivos: una actualización obsoleta devuelve conflicto.
- [x] Elegir abre la vista de campaña existente con borrador persistido: objetivo, modalidad, partidas conocidas/desconocidas, preguntas y compromisos. Estimación y objetivo no se presentan como acuerdo; «acordado» exige quién confirmó, cuándo y evidencia verificable registrada por la persona autorizada.
- [x] Decisión y borrador asociado se confirman en una sola transacción, con claves de idempotencia. Una caída no deja una decisión apuntando a una campaña inexistente; descartar o pendiente no crea una campaña ejecutada.
- [x] Autor y tenant vienen de la sesión, no del payload. La nueva decisión no usa `consensus` ni `confidenceDelta` del store en memoria, ni suma confianza por confirmar repetidamente.
- [x] Campaña elimina o deja sin datos los ejemplos de funnel/atribución que implicarían soporte de adopción no implementado. Mantiene navegación panel→campaña y puede copiar un borrador manual; no ofrece ejecutar, medir ni exportar algo que no existe.

## Demostración

Elegir con costo pendiente, registrar qué confirmación se necesita y guardar. La respuesta leída de la API contiene decisión, snapshot, autor, condiciones y campaña con sus IDs. En otra alternativa se registra descarte y su motivo, sin outcome negativo.

## Módulos y archivos probablemente afectados

`frontend/components/atlas/opportunity-drawer.tsx`, `frontend/components/atlas/campaign-panel.tsx`, `frontend/lib/server/decisions/store.ts`, `frontend/app/api/decisions/[id]/route.ts`, `frontend/lib/api/atlas-client.ts`.
Nuevos previstos: `frontend/app/api/decisions/route.ts`, repositorios de decisiones/campañas y `frontend/tests/integration/conditional-decision.test.ts`. La lectura persistida sustituye al Map en este recorrido; no se migra una señal demo como evidencia real.

## Qué test lo demuestra

`conditional-decision.test.ts` comprueba los tres estados, motivos obligatorios, condición conservada, acuerdo sin soporte rechazado, conflicto entre pestañas, idempotencia y rollback conjunto decisión/campaña. Navegador: panel → elegir con condición → campaña → confirmación de guardado. No hace falta ingesta de outcomes para probarlo.

## Decisiones abiertas

**DECISIÓN ABIERTA D1:** objetivo comprado. El borrador conserva «por confirmar» donde corresponda.
**DECISIÓN ABIERTA D2:** condiciones comerciales específicas. Se guardan explícitamente; la app no simula confirmación del organizador.

## Comments

Implementado el 2026-09-09. Sin commit ni push (los hace Julian). Autorización explícita de Julian: cambio a `ready-for-agent` antes de empezar y, vía AskUserQuestion, el alcance ampliado (migración `006`, `comparison-panel.tsx` + línea en `research-dashboard.tsx`, export mínimo en `opportunity-adapter.ts`) y la edición del contrato v1 con condiciones (campos nuevos nullable de verdad; «acordado» exige confirmedBy/confirmedAt/evidencia juntos; contrato + validador + test en el mismo cambio con round-trip).

### Qué se hizo

- **Contratos (07, edición v1 autorizada)** — `lib/contracts/evaluation.ts` + `evaluation-validation.ts` + `tests/contracts/evaluation.test.ts` juntos: `DecisionCondition` suma `owner`/`dueBy` (nullable de verdad: ausente es `null`, un string vacío o un plazo no-ISO se rechazan) y la confirmación de `CampaignCommitment` pasa a `{ method, sourceIds, confirmedBy, confirmedAt }` — «acordado» sin cualquiera de los cuatro se rechaza; una estimación/meta con confirmación sigue rechazándose. El round-trip por JSON cubre ambas formas (con valores y con null).
- **Migración `db/migrations/006-decision-condicional.sql`** (condiciones de Julian cumplidas): `growthx.decisions` — cada fila es UNA revisión inmutable (identidad `decision_id`, cadena lineal por `previous_revision_id` con `unique nulls not distinct`); `unique (tenant, decision, revision)` decide la carrera entre pestañas; una sola decisión por `(snapshot, edition)` (índice parcial sobre revision = 1); clave idempotente única; FKs compuestas por tenant al snapshot de 12 (`growthx.snapshots`), a `event_editions` y a la revisión anterior. `growthx.campaign_drafts`: a lo sumo un borrador por revisión de decisión (PK `(tenant, decision_revision_id)`), FK compuesta. RLS enable+**force** en ambas; grants mínimos: `growthx_app` select+insert; **nadie** tiene UPDATE/DELETE (append-only por grants, no solo por convención) y el worker no ve decisiones.
- **`lib/server/decisions/store.ts` REESCRITO** (sustituye al Map de la Launch Room; `consensus`/`confidenceDelta` no existen más): `saveDecision` valida contra el snapshot bajo RLS (inexistente/ajeno = no encontrado; la alternativa debe ser del snapshot), rechaza elegir un candidato con eligibility `excluded` (mensaje: nueva evidencia + reevaluación), hereda como ABIERTAS las condiciones pendientes del snapshot al elegir (elección condicional garantizada), compone el `EvaluationDecision` con autor de la sesión (`server_session`) y, si es elección, el `CampaignDraftRecord` — todo validado por el contrato — e inserta decisión y campaña **en una transacción** con clave idempotente (misma clave+payload → misma decisión; otra → 409; carrera → conflicto vía unique). `reviseDecision` usa revisión esperada (obsoleta → conflicto con la revisión vigente, sin tocar nada), conserva todas las revisiones, rechaza re-resolver una condición resuelta («confirmar repetidamente no suma nada») y conserva la identidad de la campaña entre revisiones. `readDecision`/`readDecisionsBySnapshot` revalidan contra el contrato al leer.
- **`lib/server/decisions/wire.ts` (nuevo)**: parseo estricto de POST/PATCH — claves desconocidas rechazadas; `tenantId`/`decidedBy`/`consensus`/`confidenceDelta` reciben un 400 con mensaje propio. La condición de la frontera es estructurada (`pendingItem`, `question`, `expectedAnswer`, `effect`, `owner`, `dueBy`, `snapshotConditionId`): pregunta/respuesta esperada se componen determinísticamente en `description` (quedan guardadas y visibles), efecto → `answerWouldChangeTo`, responsable/plazo → campos nuevos del contrato.
- **Rutas** — `app/api/decisions/route.ts` (nuevo): POST (201/200-dedupe/400/401/404/409 tipados; 503 en modo degradado) y GET `?snapshotId=` para recuperar el estado del panel; `app/api/decisions/[id]/route.ts` reescrito: GET persistido y autorizado (404 sin confirmar existencia ajena) y PATCH con revisión esperada. La respuesta contiene decisión, revisiones, campaña, `decisionId`, `snapshotId` y `editionId` (demostración del ticket).
- **`lib/api/atlas-client.ts`**: la sección Launch Room (`fetchDecision`/`pollDecision`, sin consumidores desde el borrado de Linq) se reemplazó por la frontera nueva: `saveConditionalDecision`, `reviseConditionalDecision`, `fetchDecisionRead`, `fetchSnapshotDecisions` (outcomes tipados, nunca lanzan) y tipos espejo.
- **`lib/api/opportunity-adapter.ts`**: la proyección de campaña que vivía inline en `projectEvaluationRead` se extrajo y se exporta como `projectCampaignDraft(campaign, sources)` (misma lógica, cero cambios de comportamiento) para proyectar el borrador leído de `/api/decisions`.
- **UI** — `comparison-panel.tsx`: sobre cada candidato del snapshot, «Registrar decisión» (elegir/descartar/pendiente con motivos obligatorios; «Elegir» deshabilitado si está excluido, con nota), editor de condiciones (pregunta, respuesta esperada, efecto, responsable, plazo), guardado idempotente (reintento conserva la clave), estado persistido con «elección condicional», resolución de condición vía PATCH con revisión esperada (conflicto → mensaje, sin sobrescribir) y navegación panel→campaña; al reabrir el run las decisiones se recuperan por `?snapshotId=`. `campaign-panel.tsx`: `CampaignDraftPanel` (nuevo) renderiza el borrador persistido (partidas conocidas/desconocidas sin 0, compromisos con «Acordado · con/SIN soporte», copiar borrador manual, sin ejecutar/medir/exportar) y `CampaignPanel` (v0) **eliminó las secciones de funnel proyectado y atribución** (criterio 8). `opportunity-drawer.tsx`: se quitó el botón «Export brief». `research-dashboard.tsx`: la sección Decisiones dejó de decir «no disponible» y explica el recorrido.

### Qué test lo demuestra

`frontend/tests/integration/conditional-decision.test.ts` — 10 subtests contra PostgreSQL REAL (sin base se salta con aviso), con catálogo sintético propio (elegible / condicionada con acceso+costo pendientes / excluida por presupuesto), perfil + DOS comparaciones procesadas in-process (sin política — D2 — y sin red) y las rutas HTTP reales: frontera (401; autor/tenant/consenso en el cuerpo → 400 con mensaje; snapshot ajeno → 404; lista vacía para el señuelo); motivos obligatorios y alternativa fuera del snapshot; **elegir con costo pendiente → elección condicional** (condición propia con pregunta/respuesta/efecto/responsable/plazo conservados + condiciones del snapshot heredadas abiertas, campaña en la misma respuesta con partida `unknown` — jamás 0 —, objetivo «por confirmar», autor persistido desde la sesión en columna, GET idéntico a lo guardado, sin consensus/confidenceDelta en todo el registro); idempotencia (retry exacto → misma decisión; misma clave+otro payload → 409; otra clave+misma alternativa → 409 `already_decided`); excluido (elegir → 409 sin persistir nada, también por PATCH; descarte con motivo propio → 201 sin campaña; borrador con descarte → 400); **conflicto entre pestañas** (resolver condición sobre revisión 1 → revisión 2; revisión esperada obsoleta → 409 con `currentRevision`, motivos intactos; re-resolver → 400; identidad de campaña estable); razones distintas por alternativa sin fabricar claims (conteo de `claim_revisions` del tenant invariante); guardar organizador (worker real del run de investigación + `saveOrganizerResearch`) sin crear decisiones ni campañas; **rollback conjunto** (pool envenenado que tira el INSERT de la campaña → cero filas, todo o nada; la vía sana confirma decisión Y campaña con la partida `quoted` y su fuente) + «acordado» sin confirmación o sin `confirmedBy` → 400 y completo → 200; tenant señuelo (ruta y SQL de aplicación bajo RLS).

`frontend/tests/contracts/evaluation.test.ts` (14 casos, actualizado): fixtures con owner/dueBy con valores y con null, confirmación con quién/cuándo; rechazos nuevos (acordado sin `confirmedBy`/`confirmedAt`; owner vacío; plazo no-ISO); round-trip intacto.

Verificación de navegador (Playwright manual, no versionada, misma decisión que 08–12): dev server real (:3210) + sesión de un tenant de demo sembrado con comparación completada; `/?run=` → panel → «Registrar decisión» → elegir con condición completa → **la campaña persistida se abre** (partida pendiente sin 0, objetivo por confirmar, copiar borrador manual, sin ejecutar/medir/exportar) → volver → «Elegida · elección condicional» con responsable y plazo → excluido con «Elegir» deshabilitado y descarte registrado sin outcome → recarga recupera decisión y campaña desde PostgreSQL sin llamar al pipeline global → resolver condición → «revisión 2» con la respuesta registrada. **17/17 checks**; capturas revisadas.

### Salida real de verificación

```text
$ pnpm --dir frontend test        (exit 0)
# tests 159     # tests 11         ← suite node --test + e2e
# pass 159      # pass 11
# fail 0        # fail 0
# cancelled 0   # cancelled 0
# skipped 0     # skipped 0
# todo 0        # todo 0
(148 previos + 11 nuevos de conditional-decision.test.ts; contratos pasó de 14 a 14 casos, ampliados)

$ pnpm --dir frontend lint        (exit 0)
$ eslint .
(sin errores ni warnings)

$ npx tsc --noEmit --incremental false   (exit 0)
$ pnpm --dir frontend build              (OK; rutas nuevas /api/decisions y /api/decisions/[id] presentes)
$ pnpm --dir frontend test:baseline      (8/8; O1–O5 «corregido», sin INESPERADO; sin fuentes nuevas en drift)
```

### Desvíos y límites documentados

- **Alcance autorizado en sesión** (AskUserQuestion): además de los archivos del ticket, `db/migrations/006-decision-condicional.sql`, `components/research-dashboard/comparison-panel.tsx`, la línea de Decisiones en `research-dashboard.tsx`, el export en `lib/api/opportunity-adapter.ts` y la edición del contrato v1 (`lib/contracts/evaluation.ts` + `evaluation-validation.ts` + `tests/contracts/evaluation.test.ts`). Los módulos nuevos del recorrido quedaron en `lib/server/decisions/` (`store.ts` reescrito + `wire.ts`).
- **Desvío no autorizado previamente y mínimo**: `tests/e2e/sf-organizer-research.spec.ts` aseveraba el placeholder de la sección Decisiones («todavía no está disponible»), escrito en 10 para caducar con este ticket; se actualizó esa única aserción al texto nuevo (mismo criterio que el desvío de 05 sobre aserciones destinadas a caducar). El resto del e2e quedó intacto y 11/11 en verde.
- **El «panel actual» es el de la comparación (12)**: la lista de archivos del ticket era pre-10/12; `opportunity-drawer.tsx` y `campaign-panel.tsx` (vista v0) se tocaron para el criterio 8 (fuera funnel/atribución/«Export brief»); la decisión vive donde vive el snapshot. Los campos legacy `funnel`/`attributionCode` siguen EXISTIENDO en el contrato v0 (`lib/api/types.ts`) y en el adaptador — la frontera v0 congelada no se cambia — pero ninguna vista los renderiza ya.
- **Pregunta/respuesta esperada dentro de `description`**: la autorización de contrato cubrió `owner`/`dueBy` y `confirmedBy`/`confirmedAt`; la pregunta al organizador y la respuesta esperada se componen determinísticamente en la descripción de la condición (guardadas, visibles y legibles). Si se quieren como campos estructurados propios, es otra edición de contrato explícita.
- **Campaña compuesta por el servidor**: si la elección no trae borrador, el esqueleto sale del snapshot y el perfil (partidas desde los claims `cost:*` de la alternativa — `quoted` con fuente, `unknown` con nota, jamás 0; objetivo provisional «por confirmar» — D1; modalidad pendiente; preguntas desde las condiciones abiertas). El cliente puede mandar su borrador y el contrato lo valida entero.
- **Sin cambios en `snapshot-store.ts › buildReadBundle`**: `runs.result` se compone al publicar (antes de decidir), así que su `decision`/`campaign` siguen null; la lectura de decisión va por `/api/decisions` (por id o por snapshot). Integrarla al bundle del run sería releer en cada GET del run; queda para cuando un ticket lo pida.
- **GET `/api/decisions?snapshotId=`**: agregado sobre la frontera propuesta por la spec (que solo listaba POST/GET:id/PATCH) para que el panel recupere el estado al reabrir el run sin conocer los ids de decisión. Mismo archivo nuevo previsto por el ticket.
- **Infra local**: migración **006 YA aplicada** al contenedor `growthx-postgres` (con un ALTER manual de `campaign_drafts.id` a `text`, porque la primera versión aplicada la tenía como uuid; el archivo de migración quedó corregido y una base fresca la crea bien). La verificación de navegador dejó un tenant de demo `demo-dcn-*` con catálogo sintético, dos runs y una decisión (inocuo, borrable); el token dev de `growthx-dev` NO se rotó. Ningún proceso quedó corriendo.
- **No se envía ningún mensaje**: registrar condiciones, resolverlas o copiar el borrador es solo persistencia/portapapeles; no hay outreach, ejecución, medición ni export.
