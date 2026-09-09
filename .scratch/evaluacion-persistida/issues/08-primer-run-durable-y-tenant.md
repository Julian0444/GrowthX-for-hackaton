# 08 — Aceptar un perfil y recuperar su run desde PostgreSQL

Status: ready-for-human

**Estado:** autorizado por Julian para implementar (2026-09-08; la autorización reemplaza los avisos de «no autorizado»).
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [07](./07-contratos-versionados.md).

## Objetivo

Permitir que el intake actual cree un run autenticado y durable que la UI pueda recuperar tras recargar, usando Next.js, PostgreSQL, pg-boss y un worker Node separado.

## Aristas de bloqueo

07 → 08: requiere contratos y semántica de incertidumbre estabilizados para persistir entradas y estados.

## Criterios de aceptación

- [x] Intake captura producto, audiencia, stack, presupuesto, fechas y objetivo explícito; la estructura final se reorganiza en 10; aquí se conecta el intake existente al servicio. El nuevo flujo deja de transmitir siempre `budgetUsd: 0`.
- [x] Migraciones crean el mínimo de tenants/pertenencias, perfiles versionados, runs/steps e idempotencia. Identidades/referencias críticas son columnas, aunque los payloads admitidos sean JSONB validado.
- [x] `POST /api/evaluations` valida sesión y pertenencia en servidor, registra perfil/run y trabajo durable antes de responder 202. La prueba cubre la atomicidad de aceptación: no puede existir una respuesta exitosa con un trabajo perdido entre commit y encolado.
- [x] El worker Node arranca como proceso separado y usa pg-boss en la misma PostgreSQL. La primera ruta de prueba procesa una entrada controlada mínima de investigación de catálogo o evaluación de evento; no depende de un servidor Next manteniendo una promesa en memoria.
- [x] `GET /api/evaluations/:id` devuelve estado y pasos persistidos. El dashboard muestra ese progreso real y conserva `runId` en un enlace interno; una recarga recupera el run en vez de disparar otra búsqueda.
- [x] Repetir la clave idempotente y payload devuelve el mismo run; cambiar el payload con esa clave devuelve conflicto. No se exponen credenciales ni se confía en un `tenantId` enviado por el navegador.
- [x] Se usan roles de aplicación sin privilegios de propietario/bypass y políticas RLS. El contexto de tenant se fija por transacción; una lectura del señuelo con identidad real no obtiene la fila. La administración de la cola no implica acceso libre a datos de negocio.
- [x] Se definen validación de jobs, límites de reintento, errores persistidos y logs por run/step/intento. Scripts y configuración documentan cómo arrancar Next, worker y PostgreSQL; secretos no se guardan en el repo.

## Demostración

Completar el intake, obtener un run, detener el worker antes de terminar el paso controlado, recargar el dashboard y reiniciarlo. El mismo run sigue visible y termina. La fuente controlada es una fixture de prueba, no un evento ficticio publicado como real.

## Módulos y archivos probablemente afectados

`frontend/components/atlas/onboarding-intake.tsx`, `frontend/components/atlas/atlas-shell.tsx`, `frontend/components/atlas/analysis-overlay.tsx`, `frontend/lib/api/atlas-client.ts`, `frontend/lib/server/env.ts`, `frontend/package.json`.
Nuevos previstos: `frontend/app/api/evaluations/route.ts`, `frontend/app/api/evaluations/[id]/route.ts`, `frontend/lib/server/evaluations/`, `frontend/lib/server/db/`, `frontend/lib/server/auth/`, `frontend/db/migrations/`, `frontend/worker/index.ts`, `frontend/tests/integration/evaluation-run.test.ts`.

## Qué test lo demuestra

`evaluation-run.test.ts` usa PostgreSQL y pg-boss reales: aceptación atómica, duplicado, conflicto, lectura tras cerrar conexión, contexto de tenant y reanudación básica. Una prueba de navegador del intake comprueba POST → estado desde GET → recarga. La matriz de caídas del workflow completo corresponde a 15.

## Decisiones abiertas

**DECISIÓN ABIERTA D3:** mecanismo de autenticación y pertenencia del tenant real. No se reemplaza con un header confiado ni un selector de tenant. El contexto inyectado se restringe a tests.
**DECISIÓN ABIERTA D5:** destino de operación compartida. Se pueden implementar y probar procesos locales; publicar el piloto espera esta decisión.

## Comments

**Implementado 2026-09-08 (sesión Claude, autorización explícita de Julian para este ticket). Sin commit ni push: los hace Julian.**

### Qué se hizo

- **Migración `frontend/db/migrations/001-evaluacion-persistida.sql` + runner `frontend/lib/server/db/migrate.ts`:** esquema `growthx` con tenants, app_users, memberships, sessions (hash de token, FK compuesta a memberships), perfiles versionados (`lineage_id` + `version`, payload JSONB validado con el contrato 07), runs (estado, `workflow_version`, `contract_version`, `unique (tenant_id, idempotency_key)` + `payload_hash`, error/result JSONB), run_steps (`unique (run_id, seq)`, intentos, error/output) y run_logs (por run/step/intento). Referencias compuestas `(tenant_id, id)` impiden enlazar perfil/run de otro tenant. RLS con `ENABLE` + `FORCE` en las cuatro tablas de negocio vía setting transaccional `growthx.tenant_id` (con `nullif`: sin contexto no hay filas). El runner (idempotente, `pnpm db:migrate`) asegura los tres roles de aplicación, aplica los .sql registrándolos en `schema_migrations`, instala el esquema `pgboss` **bajo `SET ROLE growthx_queue`** (el rol de cola es dueño de pgboss; cero grants de negocio), crea la cola `evaluation-run` (retryLimit 3, retryDelay 2 s, expire 120 s) y concede a `growthx_app` solo el camino de encolado (SELECT version/queue + INSERT/SELECT en la tabla de jobs).
- **`frontend/lib/server/db/pool.ts`:** pools por rol (`growthx_app`/`growthx_worker`) con `withTenantTransaction` (BEGIN → `set_config(..., is_local=true)` → COMMIT: el contexto se limpia solo antes de volver al pool). Modo degradado: sin URL no crashea al importar; `isEvaluationDbConfigured()` habilita el 503 tipado.
- **`frontend/lib/server/auth/session.ts`:** sesión mínima interina de D3 — token OPACO (cookie httpOnly `growthx_session` o `Authorization: Bearer`) cuyo sha256 vive en `growthx.sessions`; tenant y usuario salen de la base y la pertenencia se revalida contra memberships en cada resolución. No es header confiado ni selector de tenant. `frontend/lib/server/db/seed-dev.ts` (`pnpm db:seed-dev`) siembra tenant/usuario/sesión local e imprime el token por stdout (no se persiste en el repo).
- **`frontend/lib/server/evaluations/`:** `wire.ts` (parseo ESTRICTO del cuerpo — claves desconocidas rechazadas, incluido `tenantId`; construcción del `EvaluationProfile` del contrato 07 con objetivo `provisional` + éxito `pending` por D1; hash canónico del payload), `service.ts` (aceptación e ídem lectura; el perfil se valida con `parseEvaluationProfile` ANTES de persistir y se revalida al leer), `queue.ts` + `queue-config.ts` (encolado con pg-boss 12 **dentro de la transacción de aceptación** vía la opción `db` por llamada: perfil + run + steps + job comparten UN commit — no puede existir 202 con trabajo perdido; instancia send-only bajo `growthx_app` con `migrate/supervise/schedule: false`; `singletonKey = runId` evita jobs duplicados; validación del payload del job), `run-worker.ts` (claim del run bajo su tenant, pasos con confirmación transaccional, reanudación saltando pasos completados, error persistido por paso y por run, `queued`→reintento / `failed` definitivo al agotar `RUN_MAX_ATTEMPTS`), `fixture-catalog.ts` (entrada controlada mínima de investigación de catálogo: material **prepared** explícitamente etiquetado, sin fechas inventadas ni eventos ficticios publicados como reales; D4 pendiente).
- **Rutas `frontend/app/api/evaluations/route.ts` y `[id]/route.ts`:** POST valida sesión/pertenencia en servidor y responde 202 `{runId, statusUrl}` solo tras el commit único (409 conflicto idempotente, 400 cuerpo/`tenantId` del navegador, 401 sin sesión, 503 sin base — degradado). GET devuelve estado + pasos persistidos + resultado; run de otro tenant = 404 (RLS). Imports relativos `.ts` para ser ejercitables bajo `node --test`.
- **`frontend/worker/index.ts`** (`pnpm worker`): proceso separado; cola con `growthx_queue`, negocio con `growthx_worker`. `GROWTHX_WORKER_EXIT_AFTER_STEP` = corte controlado tras confirmar un paso (demo/test de reanudación): el job vuelve a la cola y el proceso sale con stop graceful.
- **Cliente/UI:** `lib/api/atlas-client.ts` (`startEvaluation`/`fetchEvaluation`/`pollEvaluation`, outcomes tipados, nunca lanza), `onboarding-intake.tsx` (audiencia, stack, presupuesto — vacío = desconocido explícito, jamás 0 —, ventana de fechas; producto y objetivo ya existían), `atlas-shell.tsx` (el intake dispara el run durable ADEMÁS de la búsqueda v0; `?run=` como enlace interno; recarga con `?run=` recupera el run y NO relanza la búsqueda; `toWireRequest` deja de transmitir siempre `budgetUsd: 0`), `analysis-overlay.tsx` (panel de run con pasos REALES del servidor, candidatos del resultado y estado recuperado; en vista idle se eleva con estilo inline — `globals.css` intacto).
- **`frontend/lib/server/env.ts`:** las tres URLs nuevas como specs warn-only (regla degradada intacta). **`frontend/package.json`:** deps `pg`, `pg-boss`, `@types/pg`; scripts `db:up`, `db:down`, `db:migrate`, `db:seed-dev`, `worker`. **`frontend/db/README.md`:** cómo arrancar PostgreSQL (Docker), migrar, sembrar, correr Next + worker, y la demo del ticket; sin secretos (defaults solo para el contenedor local; entornos compartidos = D5).

### Qué test lo demuestra

**`frontend/tests/integration/evaluation-run.test.ts`** — PostgreSQL y pg-boss REALES (contenedor `pnpm db:up`; sin base la suite se salta con aviso, no finge verde). 13 casos: 401 sin sesión; `tenantId` en el cuerpo → 400; aceptación 202 con run + steps + job de pg-boss en el mismo commit (y tenant desde la sesión); **atomicidad** con encolado inyectado que falla → sin run ni job huérfano; duplicado (misma clave+payload → mismo run, sin job duplicado); conflicto (409); GET con señuelo → 404 y sin sesión → 401; **RLS por SQL de aplicación** (contexto señuelo o sin contexto → 0 filas); rol de cola sin acceso a negocio (`permission denied`); **reanudación básica con worker como proceso separado real** (spawn de `worker/index.ts` con corte tras `research_catalog` → exit 0 → «recarga»: pasos 1–2 completados persistidos → segundo spawn sin corte → el MISMO run termina, `attempts = 1` en el paso confirmado — no se re-ejecutó — y logs por run/step/intento); lectura tras cerrar el pool que escribió (conexión nueva recupera el run completo); id inválido → 400 / inexistente → 404.

**Prueba de navegador (Playwright, manual con evidencia):** intake completo → 202, `?run=<id>` en la URL → **recarga** → overlay «Saved evaluation (recovered)» con run id, estado `completed`, los tres pasos reales y los candidatos del fixture; la recarga **no** disparó `/api/opportunities/search` (verificado interceptando requests); `GET /api/evaluations/:id` desde el navegador devuelve `completed` con los tres pasos. Capturas en el scratchpad de la sesión.

### Tests (salida real)

- `pnpm --dir frontend test` → **102 pass / 0 fail** (89 previos + 13 nuevos), `duration_ms 4756` (con la base local arriba; sin base, la suite de integración se salta con aviso).
- `pnpm --dir frontend lint` → exit 0.
- `npx tsc --noEmit` → limpio.
- `pnpm --dir frontend test:baseline` (diagnóstico) → 8 pass / 0 fail, **O1–O5 «corregido»**, sin INESPERADO.
- `pnpm --dir frontend build` → OK (`/api/evaluations` y `/api/evaluations/[id]` como rutas dinámicas).

### Desvíos y decisiones

- **Archivos nuevos fuera de la lista literal, dentro de los directorios previstos:** `frontend/db/README.md` (los «scripts y configuración» que exige el criterio 8) y `frontend/lib/server/db/seed-dev.ts`. Además `.env.local` local (gitignoreado, no es material del repo) con las URLs del contenedor.
- **Prueba de navegador NO como test del repo:** exigiría sumar Playwright como dependencia + un archivo de test no listado; se hizo manual con evidencia (arriba). Si la querés versionada, va con la matriz de caídas del ticket 15.
- **D3 (interinato):** el mecanismo de sesión implementado es el mínimo real (token opaco hasheado emitido por el servidor); la identidad de la demo compartida sigue abierta. El único contexto inyectado sin token vive en los tests (servicio con pool/cola inyectados).
- **Atomicidad por integración transaccional de pg-boss** (la vía preferida de la spec, no el outbox alternativo): pg-boss 12 acepta un `db` por llamada y el INSERT del job corre con el cliente de la transacción de aceptación. Verificado en el test y en el smoke.
- **`GROWTHX_WORKER_EXIT_AFTER_STEP`** existe para la demo y el test de reanudación (corte determinístico tras confirmar un paso); no altera el procesamiento normal.
- **El run durable convive con la búsqueda v0** (frontera de caracterización intacta): el intake dispara ambos; la reorganización del dashboard es del ticket 10. La matriz completa de caídas del workflow corresponde a 15 (acá solo la reanudación básica).
- **Presupuesto:** el intake distingue declarado de desconocido; el perfil persiste `{status:'declared'|'unknown'}` (contrato 07) y la búsqueda v0 recibe el monto declarado (desconocido viaja con el sentinel 0 de v0, semántica del ticket 02; su representación nueva ya vive en el perfil persistido).
- `plan/handoff.md` no se tocó (mismo criterio que 07); si querés la sección de sesión, pedila aparte.
