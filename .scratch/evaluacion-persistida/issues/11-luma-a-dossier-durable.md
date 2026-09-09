# 11 — Convertir una URL de Luma en un dossier durable

Status: ready-for-human

**Estado:** implementación autorizada explícitamente por el usuario para este ticket; reemplaza los avisos de «no autorizado» de los documentos.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [09](./09-dossier-catalogo-curado.md).

## Objetivo

Conectar el importador de Luma existente al workflow para que su resultado y sus campos pendientes sobrevivan al cierre de la pantalla y a fallos recuperables.

## Aristas de bloqueo

09 → 11: reutiliza el modelo de eventos/claims, su repositorio y el panel del dossier; no crea un segundo formato de importación.

## Criterios de aceptación

- [x] Pegar una URL en `EventImport` llama a la operación durable y muestra `runId` y progreso real. `POST /api/events/ingest` delega en `startEvaluation`; cliente y ruta adoptan juntos la respuesta asíncrona.
- [x] La obtención y el parseo corren en el worker. Se reutiliza el parser actual; datos extraídos se convierten en claims con método y fuente, no en un bloque con una confianza global que oculte qué falta.
- [x] La importación usa exclusivamente páginas de eventos Luma aportadas por el usuario. Se valida HTTPS, hostname, credenciales/puertos y cada redirección; destinos no permitidos, tamaños excesivos y timeouts se rechazan antes de continuar. No se sigue una URL externa sugerida por el HTML.
- [x] Fecha, ciudad, acceso, audiencia o costo ausentes permanecen pendientes. Un HTML inaccesible o insuficiente produce fallo o dossier parcial explícito; nunca un fallback a un evento seed.
- [x] URLs canónicas admitidas y aliases comprobados se relacionan con la identidad existente del evento. Importar de nuevo un evento del catálogo no crea otra identidad lógica: puede crear una nueva revisión de evidencia trazable.
- [x] El contenido de la página no puede pedir herramientas, cambiar tenant, modificar la política ni guardar una decisión. La validación alcanza campos JSON-LD y metadatos; no se interpreta texto de la fuente como instrucciones.
- [x] La UI reabre el dossier desde PostgreSQL después de terminar el step, incluso si el navegador se cerró durante la descarga. Un error conserva URL solicitada, intento y causa visible sin guardar credenciales o HTML completo innecesario.

## Demostración

Pegar una URL, cerrar la pestaña durante la obtención, volver al run y abrir el dossier con sus campos pendientes. Repetir la solicitud con la misma clave y comprobar que no aparece un segundo run.

## Módulos y archivos probablemente afectados

`frontend/app/api/events/ingest/route.ts`, `frontend/lib/api/luma.ts`, `frontend/lib/api/types.ts`, `frontend/lib/api/atlas-client.ts`, `frontend/components/atlas/event-import.tsx`, `frontend/components/atlas/atlas-shell.tsx`.
Nuevos previstos: adaptador Luma en `frontend/lib/server/catalog/`, step de obtención del worker, `frontend/tests/integration/luma-dossier.test.ts`.

## Qué test lo demuestra

`luma-dossier.test.ts` con proveedor HTML controlado y PostgreSQL/cola reales: HTML completo/parcial, URL inválida, redirección fuera de allowlist, límite de tamaño, timeout, duplicado y prompt injection dentro de una descripción. Navegador: pegar → progreso → dossier → recarga. El smoke de una URL real se registra aparte, sin volver a CI dependiente de Luma.

## Decisiones abiertas

**DECISIÓN ABIERTA D4:** URL real y permiso/base de uso documentada para la demo. No se agregan scraping ni mecanismos para eludir restricciones si la página no permite extracción.

## Comments

Implementado el 2026-09-08 (sesión autorizada explícitamente por Julian; la autorización cubrió este ticket y reemplaza los avisos de «no autorizado» de los docs). Verificación final en verde; **sin commit ni push** (los hace Julian).

### Qué se hizo

**Ruta y cliente (asíncronos juntos, un solo motor de importación):**
- `app/api/events/ingest/route.ts` reescrita: valida sesión (401 sin cookie/Bearer) y URL, y delega en `startEvaluation` (`evaluationService.acceptEventIngest`) → **202 con `runId`/`statusUrl`/`deduplicated`**; 409 por clave idempotente con otro payload; 400 por URL o cuerpo inválido; 503 tipado sin base (modo degradado intacto). El fetch síncrono desapareció de la ruta.
- `lib/api/atlas-client.ts`: `ingestEvent` (síncrono) reemplazado por `startEventIngest` (outcome tipado, nunca lanza) + `eventIngestResult` (guarda tipada del resultado del run) + espejo de `requestedUrl` en `EvaluationRunView` y `imported` en `CurationInfo.material`.
- `lib/api/types.ts`: `EventIngestResponse` queda documentada como contrato interno del parser (ya no es la respuesta HTTP).

**Aceptación durable (misma maquinaria de 08):**
- `lib/server/evaluations/wire.ts`: `parseEventIngestStartBody` (parseo estricto: claves desconocidas rechazadas; `idempotencyKey` 8–128; URL canonicalizada ANTES de aceptar; `profileRunId` UUID) y `eventIngestPayloadHash` (URL canónica: dos aliases del mismo evento con la misma clave son la MISMA solicitud). `EvaluationRunView.requestedUrl` nuevo.
- `lib/server/evaluations/service.ts`: `acceptEventIngest` — una transacción atómica (run + 4 steps + job de pg-boss en el mismo commit), idempotencia por `(tenant, clave)` con la misma recuperación de carrera que `accept` (helper compartido). El run usa `mode: 'event_evaluation'` (ya admitido por el esquema de 001), workflow `luma-ingest/1`, y **reutiliza el perfil de una investigación existente del tenant** (`profileRunId`, resuelto bajo RLS: uno ajeno «no existe» → 400). Decisión tomada con Julian vía AskUserQuestion: la importación no fabrica producto/audiencia/objetivo.
- `lib/server/evaluations/run-worker.ts`: despacho de `fetch_event_page` y `persist_dossier`; `publish_result` publica `LumaIngestResult` para el workflow de importación; `ProcessRunDeps.lumaIngest` inyecta transporte/límites en tests.

**Worker y adaptador (obtención y parseo en el worker):**
- `lib/server/evaluations/luma-step.ts` (nuevo): steps `validate_profile → fetch_event_page → persist_dossier → publish_result`; la salida del paso de obtención se confirma transaccionalmente antes de persistir y se REVALIDA al reanudar; el resultado publicado solo referencia el dossier (que se lee SIEMPRE de PostgreSQL).
- `lib/server/catalog/luma-adapter.ts` (nuevo): validación/canonicalización de URL (https — http/sin esquema se eleva; otros esquemas, credenciales embebidas, puertos no estándar y hosts fuera de la allowlist lu.ma/luma.com se rechazan; forma canónica `https://lu.ma/<ruta>` sin query); obtención con `redirect: 'manual'` validando CADA destino con las mismas reglas (sin elevación de esquema), límite de tamaño por streaming (2 MB default, corta la descarga), timeout por petición (10 s default) y máx. 3 redirecciones; **reutiliza `parseLumaEvent` de `lib/api/luma.ts` sin cambios**; sanea y trunca cada campo extraído (dato, jamás instrucción); `declaredDateFromLuma` conserva la incertidumbre real (con zona → `instant`; solo día → `date_only` sin zona; hora sin zona → `ambiguous` con rango UTC−12…+14; ausente → `unknown`, jamás «hoy»); `persistLumaDossier` en UNA transacción bajo el tenant: carga de procedencia (`catalog_loads`, `material: 'imported'`), fuente inmutable con **sha256 del HTML** (no se conserva la página completa), revisión de edición encadenada y claims por atributo (`date`/`location`/`access`/`organizer`/`venue` `announced` con `method: 'jsonld_extraction'` y fuente; ausentes → claims `pending` con nota, solo si no existía conocimiento previo del atributo). Idempotente ante re-entrega (ids deterministas por run; el material ya persistido se recompone sin duplicar).
- **Identidad (arista 09→11):** la URL canónica normalizada (aliases lu.ma/luma.com/www) se compara contra la última revisión de cada edición del tenant; coincidencia → **nueva revisión encadenada sobre la MISMA identidad** (lo que la página afirma se revisa; lo que no publica NO entierra el valor previamente respaldado — p. ej. la ciudad curada se conserva si la página no la publica); sin coincidencia → identidad nueva `luma-<slug>` (colisión de slug sin coincidencia canónica → sufijo, nunca fusión). Los claims encadenan por atributo al claim existente. Reutiliza el repositorio de 09: `upsertSources`/`upsertClaimRevisions`/`readClaimsForSubjects` y `upsertEditionRevisions` (ahora exportado de `catalog/store.ts`).

**Datos:**
- `db/migrations/004-importacion-luma.sql` (nueva): etiqueta `material: 'imported'` en `catalog_loads` (mentir `synthetic`/`curated` ocultaría que nadie revisó el material) y grants de INSERT para `growthx_worker` SOLO sobre lo que la importación escribe (sources, ediciones, claims, loads). El worker sigue sin poder escribir empresas, organizadores ni participaciones: la importación no crea identidades de organizador ni roles comerciales (el organizador queda como claim `announced`; `SnapshotAlternative.organizerId: null` ya modela «organizador pendiente»).
- `lib/server/catalog/manifest.ts`: solo el tipo `CatalogMaterial` se amplía; un manifiesto de curación sigue admitiendo únicamente `synthetic`/`curated`.

**UI (runId, progreso real, dossier reabierto de PostgreSQL):**
- `components/atlas/event-import.tsx` reescrito: pegar → `startEventIngest` → panel con `runId`, URL solicitada, pasos persistidos con intentos, error con causa visible, aviso de dossier parcial y botón «Abrir dossier persistido» (abre el panel del dossier de 09 vía `/api/catalog/editions/:id`). El card síncrono anterior desapareció con su motor.
- `components/research-dashboard/research-dashboard.tsx`: `importUrl` llama a la operación durable con clave idempotente conservada en reintentos (misma regla que `launch`); `profileRunId` = run abierto o investigación más reciente (sin ninguna, mensaje honesto de completar el perfil primero); aceptado → `openRun` (el `?run=` queda en la URL y una recarga recupera el run); run de importación completado → recarga del catálogo persistido; etiquetas de los pasos nuevos y nota de cobertura para material importado; el texto del panel ya no dice que la persistencia «corresponde al siguiente paso».
- `lib/api/opportunity-adapter.ts`: nota visible de material importado en la proyección del dossier.

### Tests

`frontend/tests/integration/luma-dossier.test.ts` (nuevo; PostgreSQL y pg-boss REALES, transporte HTML controlado inyectado al worker; sin base se salta con aviso). 12 subtests, salida real de la corrida final:

```
ok 1 - POST sin sesión → 401; la validación de URL ocurre antes de aceptar nada
ok 2 - profileRunId de otro tenant → 400 (RLS: no existe para esta sesión)
ok 3 - HTML completo: 202 → obtención en el worker → dossier durable con claims
ok 4 - duplicado: misma clave y misma URL (alias) → el MISMO run, sin un segundo
ok 5 - HTML parcial: dossier parcial explícito, jamás un fallback a un evento seed
ok 6 - redirección dentro de la allowlist: se valida y se sigue
ok 7 - redirección fuera de la allowlist: fallo con URL solicitada, intento y causa
ok 8 - límite de tamaño: la descarga se corta y el run falla con causa visible
ok 9 - timeout: la obtención vence y el run falla con causa visible
ok 10 - prompt injection en la descripción: texto de la fuente = dato, jamás instrucción
ok 11 - identidad existente: URL canónica y aliases se relacionan; reimportar crea revisión, no identidad
ok 12 - reanudación idempotente: repetir persist_dossier no duplica material
```

Verificación final (comandos pedidos, salida real):

```
$ pnpm --dir frontend test        (exit 0)
# tests 133 / # pass 133 / # fail 0        (suite principal; 120 previos + 13 nuevos)
# tests 11  / # pass 11  / # fail 0        (e2e sf-organizer-research)

$ pnpm --dir frontend lint        (exit 0)
$ eslint .                        (sin errores ni warnings)
```

Además: `npx tsc --noEmit` limpio, `pnpm build` OK (ruta `/api/events/ingest` presente) y `pnpm test:baseline` 8/8 — O1–O5 «corregido», sin INESPERADO (diagnóstico intacto; no se regeneraron `characterization.json` ni `manifest.json`).

**Demostración en navegador** (Playwright manual, no versionado — misma decisión que 08/09; si se versiona va con la matriz del ticket 15): dev server + tenant/sesión propios (`luma-browser-check`) → pegar `https://lu.ma/growthx-browser-check` → 202, panel con runId + 4 pasos «Pendiente» + `?run=` en la URL → **cierre del navegador durante la obtención** → run completado por un proceso worker con transporte controlado (HTML parcial: sin ciudad/acceso/organizador) → navegador NUEVO en `/?run=<id>` recupera el run «Completado» con sus 4 pasos → «Abrir dossier persistido» abre el dossier desde PostgreSQL con fecha anunciada 2027-05-15, ciudad/acceso/audiencia/costo/organizador **pendientes con su pregunta concreta**, método/fuente por claim y la nota de material importado. Idempotencia por HTTP: dos POST con la misma clave → el mismo `runId` (`deduplicated: true`), `count(*) = 1` en `growthx.runs`. **No se consultó ninguna URL real de Luma** (D4 sigue abierta; el smoke real se registra aparte, como pide el ticket).

### Desvíos y decisiones (autorizados en sesión vía AskUserQuestion)

- **Archivos fuera de la lista del ticket** (autorizados por Julian): `lib/server/evaluations/wire.ts`, `service.ts`, `run-worker.ts` (startEvaluation solo aceptaba `catalog_research`), `components/research-dashboard/research-dashboard.tsx` (desde el ticket 10 el importador se monta ahí, no en `atlas-shell`), `db/migrations/004-importacion-luma.sql`, y cambios mínimos en `lib/server/catalog/store.ts` (export), `lib/server/catalog/manifest.ts` (tipo) y `lib/api/opportunity-adapter.ts` (nota de material).
- **Perfil del run** (elección de Julian): referencia a una investigación existente (`profileRunId`) en vez de reenviar o fabricar un perfil. Consecuencia de UI: sin ninguna investigación previa, el importador pide completar el perfil primero (coherente con el paseo de la spec: intake → importar).
- **Listados como probables y NO tocados:** `lib/api/luma.ts` (el parser se reutiliza tal cual; no tiene imports de runtime y corre bajo el worker sin cambios) y `components/atlas/atlas-shell.tsx` (wrapper de `ResearchDashboard` desde el ticket 10; nada que cablear ahí).
- **Higiene de la cola en tests:** la suite nueva procesa sus runs en el proceso de prueba y CANCELA sus propios jobs de pg-boss (tenants `luma-%`, al inicio y tras cada aceptación) — sin eso, el worker real que arranca `evaluation-run.test.ts` levantaba jobs de importación huérfanos y salía a la red de verdad (se observó rompiendo su subtest de reanudación). Se limpiaron además, por única vez vía SQL en el contenedor local, jobs huérfanos de corridas anteriores (incluidos 3 de tenants `it-real-*` dejados por las corridas fallidas intermedias).
- **Límites conocidos:** el historial del Resumen (`dashboard-store.readResearchHome`) sigue listando solo investigaciones `sf-organizers/1`; un run de importación se recupera por su enlace `?run=` (lo que exige el criterio). El expediente muestra «Verificado … por <uuid>» para cargas importadas (panel de 09 sin cambios); si molesta, es un ajuste de copy para 12+. `endsAt` y sponsors/premios no se persisten (el parser ya los declara ausentes). Los datos del check de navegador quedaron bajo el tenant `luma-browser-check` del contenedor local (inocuos; borrables).
- **Sin scraping nuevo ni URL real** (D4): la importación solo obtiene la URL admitida aportada por el usuario; los tests y la demo usan transporte controlado.
