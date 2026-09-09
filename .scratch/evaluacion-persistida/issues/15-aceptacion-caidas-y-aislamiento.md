# 15 — Demostrar el slice completo bajo caídas y cruces de tenant

Status: ready-for-human

**Estado:** autorizado por Julian para implementar (2026-09-09; la autorización reemplaza los avisos de «no autorizado»).
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [11](./11-luma-a-dossier-durable.md), [14](./14-reabrir-desde-dashboard.md).

## Objetivo

Probar que la demo completa conserva runs y decisiones ante reinicios y no permite cruces entre el tenant real y el señuelo.

## Aristas de bloqueo

11 → 15: debe existir importación Luma integrada al workflow.
14 → 15: debe existir guardar/cerrar/reabrir desde la UI. Aquí convergen los dos recorridos; no basta probar cada servicio aislado.

## Criterios de aceptación

- [x] La suite levanta PostgreSQL y pg-boss reales, Next y worker en procesos separados, con roles de aplicación y dos tenants. Los proveedores se controlan; no se simula la durabilidad con Maps.
- [x] Se interrumpe el worker de forma abrupta durante obtención, después de guardar claims, después de guardar snapshot y antes de confirmar el job; al reiniciar, el mismo run llega a un estado terminal sin perder avances confirmados ni duplicar sus efectos.
- [x] Se prueba fallo entre aceptación HTTP y despacho durable y entre commit de step y siguiente trabajo. La entrega duplicada y dos workers compitiendo no publican dos snapshots finales ni campañas/decisiones duplicadas. Llamadas HTTP no confirmadas pueden repetirse y quedan trazadas.
- [x] Timeout o salida inválida del modelo completan el dossier con explicación determinística y estado de degradación. Error de fuente agotando reintentos queda fallido/parcial y visible; no aparece una recomendación preparada para ocultarlo.
- [x] Con IDs conocidos del otro tenant, API, listados, lectura de fuentes, modificaciones, claims referenciados, sesiones, pool de conexiones e idempotencia rechazan el cruce. Un job con tenant/payload discordante es rechazado por el worker; los errores no revelan el contenido del señuelo.
- [x] Se ejecuta con roles sin bypass y se verifica que el contexto de una conexión reutilizada no se filtra al siguiente tenant. Acceso directo de aplicación a una fila ajena queda bloqueado por RLS.
- [x] La prueba de navegador completa pegar URL → dossier con campos pendientes → elegir condicionalmente → guardar → cerrar → reabrir, cotejando identidad, evidencia y condiciones. Otra prueba recorre perfil → organizadores pertinentes de SF → antecedente con empresa/rol → evento → decisión sin abrir el mapa. Un resultado comercial ausente se muestra desconocido; una edición de otra ciudad no se vuelve una oportunidad local.
- [x] Logs permiten reconstruir run→steps→claim revisiones→snapshot→decisión, intentos, tiempos y degradación. No incluyen secretos ni texto privado innecesario; uso/costo desconocido sigue explícito.
- [ ] La aceptación humana verifica 2–5 eventos futuros reales de SF, con dos organizadores distintos y antecedentes y una URL de Luma permitida, con fecha/revisor registrados. No se declara catálogo real por pasar con fixtures ni se da por validada compra, recruiting o mejora de resultados.
- [x] Se adjunta resultado de pruebas automáticas y guion de demo con evidencias de recuperación/aislamiento. Los cinco tests de v0 siguen activos y verdes; no se amplía el alcance para completar el loop de outcomes.

## Demostración

Una persona pega la URL y cierra la pestaña; otra detiene/reinicia el worker. Al volver, se abre el dossier y se guarda una decisión condicional. Tras cerrar y reiniciar Next, la misma persona la recupera; la sesión señuelo no puede leerla ni modificarla.

## Módulos y archivos probablemente afectados

`frontend/worker/`, `frontend/lib/server/evaluations/`, `frontend/lib/server/db/`, `frontend/lib/server/auth/`, rutas del slice y scripts de pruebas.
Nuevos previstos: `frontend/tests/integration/worker-recovery.test.ts`, `frontend/tests/integration/tenant-isolation.test.ts`, `frontend/tests/e2e/persisted-evaluation.spec.ts` y una nota local de evidencia de aceptación. Los cambios de runtime se limitan a fallos demostrados por esta matriz.

## Qué test lo demuestra

Los tres archivos anteriores usan barreras explícitas de prueba alrededor de commits para matar procesos y repetir los mismos puntos de fallo; no dependen de sleeps arbitrarios. Se verifica unicidad e identidad con consultas bajo roles apropiados, además del estado visible. Se ejecutan test, lint y build de frontend; un fallo previo ajeno se documenta y se distingue de una regresión del slice.

## Decisiones abiertas

**DECISIÓN ABIERTA D3 y D4:** bloquean la aceptación con usuario y eventos reales.
**DECISIÓN ABIERTA D5:** bloquea afirmar operación compartida si solo se probaron procesos locales.
**DECISIÓN ABIERTA D1/D2:** si siguen pendientes, la demo se presenta como evaluación factual/condicional con objetivo provisional y sin ranking comercial, no como piloto comprado.

## Comments

**Implementado el 2026-09-09, autorizado por Julian (la autorización reemplazó los avisos de «no autorizado»). Sin commit ni push: los hace Julian.**

### Qué se hizo

- **`frontend/tests/integration/worker-recovery.test.ts`** (nuevo, 10 subtests): la matriz de caídas con PostgreSQL, pg-boss y el worker como PROCESO separado. SIGKILL real en los cuatro puntos del criterio — con la obtención EN VUELO (barrera: archivo marker escrito por el transporte, sin sleeps), tras guardar claims (paso sin confirmar), tras confirmar el snapshot, y con el run terminal pero el job sin confirmar — más el corte entre commit de paso y siguiente trabajo. En cada punto: reinicio, el MISMO run llega a terminal, conteos exactos (cero efectos duplicados, un solo snapshot/dossier, `attempts` verificados). Además: cola caída en la aceptación (cero filas y cero jobs; el reintento del cliente con la misma clave queda trazado), entrega duplicada + dos workers vivos, carrera determinística de dos entregas del mismo run (compuertas, no sleeps), timeout y salida inválida del modelo (degradación declarada, `usage: null` explícito, snapshot idéntico), fuente que agota los 4 intentos (run `failed` visible, `result: null`, sin recomendación preparada), y reconstrucción run→steps→claims→snapshot→decisión por SQL con auditoría de secretos y de un centinela de texto privado del HTML importado.
- **`frontend/tests/integration/tenant-isolation.test.ts`** (nuevo, 8 subtests): ambos tenants curan el MISMO material público (la colisión de ids no filtra nada) más una edición/organizador/fuente propios con centinela. Con IDs conocidos del otro tenant: API (404 con cuerpo IDÉNTICO al de un id inexistente), listados, dossiers/fuentes, PATCH, comparación/importación/decisión con referencias ajenas (nada persistido), idempotencia (la clave ajena crea un run PROPIO, jamás deduplica hacia el otro tenant), sesiones (expirada 401; una sesión sin pertenencia ni siquiera puede existir por FK), pool `max: 1` con el mismo `pg_backend_pid()` (sin contexto → 0 filas; transacción que falla a mitad → el señuelo no hereda nada), roles sin `rolsuper`/`rolbypassrls`, RLS ante UPDATE/INSERT ajenos, rol de cola sin negocio, y dos jobs forjados (tenant discordante y forma inválida) rechazados por el worker REAL sin tocar el run. Cada respuesta de cruce se audita contra ambos centinelas.
- **`frontend/tests/e2e/persisted-evaluation.spec.ts`** (nuevo, 4 subtests; entra en `pnpm test`): la Demostración del ticket con navegador, Next, PostgreSQL y worker reales — pegar URL de Luma (transporte de fixture) → cerrar la pestaña → el worker cae por SIGKILL en la barrera de persistencia → reinicio → dossier durable con fecha/acceso/costo PENDIENTES (extracción parcial; jamás «hoy») → comparar (la edición importada queda `conditional`) → elegir condicionalmente con condición completa → cerrar navegador, worker y Next → REINICIAR Next → recuperar por el enlace interno (identidad, motivos, condición, campaña y revisión de edición fijada cotejados; cero escrituras y cero llamadas externas; contadores del navegador + invariantes SQL) → señuelo sin lectura ni PATCH. Segundo recorrido: perfil → organizadores pertinentes → antecedente Berlín con empresa/rol («Resultado comercial desconocido» visible) → evento → decisión guardada, con `sf-map` en 0 todo el tiempo y `ed-berlin-future` fuera de la lista local.
- **Barreras de prueba en runtime** (exigidas por «barreras explícitas alrededor de commits», inertes sin las variables): `lib/server/evaluations/run-worker.ts` expone `testBarrier` con los puntos `before_step_commit:<paso>` / `after_step_commit:<paso>` / `before_job_ack`; `worker/index.ts` las cablea desde `GROWTHX_WORKER_KILL_AT` (SIGKILL a sí mismo: sin graceful, sin ack, sin cerrar pools) y suma `GROWTHX_WORKER_LUMA_FIXTURE`/`GROWTHX_WORKER_LUMA_CALLS_FILE` (transporte de obtención controlado por archivo, releído por request; toda la validación del adaptador sigue corriendo; URL no grabada falla).
- **Único cambio de comportamiento de runtime, demostrado en ROJO por la matriz y corregido**: en `processEvaluationRun`, el path de fallo degradaba lo confirmado por una entrega competidora — el intento perdedor marcaba `failed` un paso ya completado y devolvía a `queued` (o `failed`) un run ya `completed`, borrándole el `error: null`. Las dos actualizaciones ahora llevan guarda (`state <> 'completed'` / `state not in ('completed','failed')`). El subtest de la carrera se corrió primero contra el código sin la guarda (rojo: run `queued`, paso `failed`) y con ella (verde).
- **`.scratch/evaluacion-persistida/aceptacion-15.md`** (nuevo): la nota local de evidencia — matriz criterio→prueba, salidas reales, guion de demo manual de recuperación/aislamiento, y el apartado de aceptación humana PENDIENTE con sus campos (fecha/revisor) sin completar.
- **`frontend/package.json`**: el spec nuevo se agregó a `test` y `test:e2e` («scripts de pruebas» de la lista del ticket).

### Tests (salida real, 2026-09-09)

```
$ pnpm --dir frontend test
  node --test "tests/**/*.test.ts"                → # tests 179 · pass 179 · fail 0
  node --test tests/e2e/sf-organizer-research     → # tests  11 · pass  11 · fail 0
  node --test tests/e2e/reopen-evaluation         → # tests   7 · pass   7 · fail 0
  node --test tests/e2e/persisted-evaluation      → # tests   5 · pass   5 · fail 0
  exit 0   (tres corridas completas consecutivas con el mismo resultado)

$ pnpm --dir frontend lint
  $ eslint .
  exit 0 (sin warnings)

$ npx tsc --noEmit                → limpio
$ pnpm --dir frontend build       → OK (next-env.d.ts restaurado con git checkout)
$ pnpm --dir frontend test:baseline → 8/8, O1–O5 «corregido», sin INESPERADO
```

(179 = 159 previos + 11 de worker-recovery + 9 de tenant-isolation; total del comando: 202 pass / 0 fail / 0 skipped.)

### Desvíos y decisiones no obvias

- **Bases dedicadas por suite** (`growthx_t15_recovery` / `growthx_t15_isolation`, recreadas con `drop database … with (force)` al inicio): `node --test` corre los archivos en paralelo y la cola pg-boss es POR BASE — sin esto, el worker de `evaluation-run.test.ts` levantaría los jobs de la matriz sin el transporte controlado (y saldría a la red real), y los workers con barreras de kill matarían jobs ajenos. Los roles son de clúster y las migraciones corren igual; como el lock advisory de `runMigrations` es por base, la carrera de `ALTER ROLE` entre suites se reintenta en el test (hasta 5 veces ante «tuple concurrently updated»). No se tocó `migrate.ts`.
- **Re-entrega acelerada tras SIGKILL**: un job `active` de un worker muerto recién expira a los 120 s (`expireInSeconds`); los tests lo reponen a `retry` con `start_after = now()` vía SQL admin — exactamente lo que hace el mantenimiento de la cola, sin esperar. El estado de negocio bajo prueba no se toca (patrón ya usado por las suites de 11+ para cancelar jobs).
- **La carrera de dos workers** no puede forzar el unique del snapshot desde afuera (el chequeo de existencia de `persistOfficialSnapshot` vive dentro de su transacción y una segunda entrega tardía converge a `already_persisted`); el fallo real demostrable era el del path de fallo (arriba). La unicidad del snapshot queda igualmente demostrada por el unique `(tenant, run)` + los subtests de re-entrega/duplicado (siempre 1 snapshot, resultado byte a byte idéntico).
- **Criterio de aceptación humana SIN marcar**: bloqueado por D3/D4 como declara el propio ticket. La nota de evidencia deja el guion y los campos de registro listos, y explicita que NADA se declara catálogo real por pasar con fixtures ni se da por validada compra/recruiting/outcomes. Con D1/D2 abiertas la demo es evaluación factual/condicional (sin política, «política pendiente»); D5 impide afirmar operación compartida (todo local).
- **Alcance por archivos**: los tocados están todos dentro de los módulos que el ticket nombra (`frontend/worker/`, `lib/server/evaluations/` — solo `run-worker.ts` —, «scripts de pruebas» = `package.json`, los tres tests nuevos y la nota). `lib/server/db/`, `lib/server/auth/` y las rutas del slice quedaron SIN cambios: la matriz no demostró ningún fallo ahí.
- **Mensaje visible de fuente caída**: el adaptador Luma publica «no se pudo alcanzar la página del evento (error de red)» sin filtrar el detalle interno del transporte; la prueba asevera ese mensaje (la causa real visible) y no el texto del error inyectado.
- **Sin red ni claves**: las tres suites borran `GEMINI_API_KEY`/`EXA_API_KEY`/`APIFY_TOKEN` de su entorno; el e2e además exige la degradación «GEMINI_API_KEY ausente» para detectar un worker ajeno con claves en la cola compartida (mismo mecanismo que el e2e de 14). Antes de correr, apagar cualquier `pnpm worker` de desarrollo (esta sesión apagó el que estaba vivo, PID 99139).

### Límites conocidos

- La aceptación humana con eventos reales de SF queda pendiente de D3/D4 (ver `aceptacion-15.md`).
- Las bases `growthx_t15_*` quedan en el contenedor tras cada corrida (se recrean al inicio de la siguiente); son solo de test y pueden borrarse con `drop database`.
- El e2e comparte la base principal `growthx` (corre en serie, después de las suites de integración) y limpia sus tenants `persisted-e2e-%` al terminar.
