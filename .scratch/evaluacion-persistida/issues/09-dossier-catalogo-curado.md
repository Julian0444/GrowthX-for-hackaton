# 09 — Persistir dossiers de organizadores y eventos curados de SF

Status: ready-for-human

**Estado:** autorizado por Julian para implementar (2026-09-08; la autorización cubre solo este ticket).
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [08](./08-primer-run-durable-y-tenant.md).

## Objetivo

Mostrar expedientes persistidos de organizadores y eventos con evidencia por claim sobre un catálogo mínimo de SF y sus antecedentes curados.

## Aristas de bloqueo

08 → 09: necesita tenant, PostgreSQL, contratos, run y lectura de estados; aporta los expedientes que usará el dashboard de 10.

## Criterios de aceptación

- [x] Un manifiesto de curación autorizado permite cargar 2–5 eventos futuros de SF bajo el tenant real con URL, revisión, fecha de verificación y responsable. El mecanismo es una carga interna explícita; no es una UI de organizador, CSV de outcomes ni scraping.
- [x] Cada evento del catálogo real tiene fecha y lugar respaldados a la fecha de revisión; los campos de audiencia, acceso y costo pueden quedar pendientes. «Evento futuro verificado» no se presenta como «todas sus promesas confirmadas».
- [x] La identidad del evento y las revisiones evitan duplicados al repetir una carga. Toda referencia fuente→claim→evento queda dentro del tenant mediante consultas y restricciones compuestas.
- [x] Abrir el run desde el enlace de evaluación lleva al panel existente y al dossier leído desde PostgreSQL. La selección del catálogo puede usar un control mínimo en ese panel; el dashboard de descubrimiento se construye en 10. El mapa usa solo ubicación respaldada y no es necesario para acceder al expediente.
- [x] El panel muestra por separado fecha/lugar, acceso, audiencia, costo y organizador; cada valor material permite abrir su fuente/localizador, fechas, estado, método y alcance. Los faltantes producen preguntas concretas.
- [x] El expediente del organizador contiene afirmaciones documentadas, no un puntaje único ni una generalización automática. Se pueden registrar antecedentes publicados manualmente como claims con fuente, sin ingesta de resultados de campañas.
- [x] Dos fuentes contradictorias conservan sus revisiones y muestran el conflicto; una edición no borra la evidencia anterior. La mera presencia pública de una página no se convierte en licencia para almacenar y republicar todo su contenido.
- [x] Un evento que vence después de curarse se marca como tal al evaluarlo. El catálogo no se rellena con los seeds históricos si queda sin opciones vigentes.

## Criterios del expediente de organizador

- [x] Hay al menos dos organizadores distintos para comparar y un antecedente histórico documentado por cada uno. Si no se consigue, se declara insuficiencia de cobertura; no se fabrica trayectoria.
- [x] Se registra al menos una relación de empresa participante con rol claro para demostrarla, o se muestra su ausencia como limitación. El rol debe poder recorrerse empresa → edición → fuente.
- [x] Organizador, serie, edición y empresa son independientes. Dos homónimos no se fusionan; un coorganizador no hereda todos los eventos ajenos. Se conservan correcciones revisionadas.
- [x] Se separan anuncio, ejecución reportada y resultado del sponsor. «No publicado» no equivale a fracaso. Empresas comparables nombradas por el cliente se enlazan solo a relaciones respaldadas.
- [x] Antecedentes de fuera de SF conservan su geografía; no aparecen como oportunidades futuras locales. La curación manual no agrega conectores ni ingesta de outcomes.

Archivo nuevo probable adicional: `frontend/app/api/organizers/[id]/route.ts`. El test de dossier debe cubrir homónimos, rol ambiguo, fuente replicada y resultado comercial ausente.

## Demostración

Abrir un evento curado, inspeccionar una afirmación sobre su organizador, un costo pendiente y dos fuentes que discrepan sobre audiencia. Recargar y encontrar los mismos claims y revisiones en el panel.

## Módulos y archivos probablemente afectados

`frontend/components/atlas/opportunity-drawer.tsx`, `frontend/components/atlas/evidence-links.tsx`, `frontend/components/atlas/result-rail.tsx`, `frontend/components/atlas/world-map.tsx`, `frontend/lib/api/opportunity-adapter.ts`.
Nuevos previstos: `frontend/lib/server/catalog/`, `frontend/lib/server/evidence/`, migraciones de eventos/fuentes/claims, `frontend/scripts/load-curated-catalog.ts`, `frontend/tests/integration/curated-dossier.test.ts`.

## Qué test lo demuestra

`curated-dossier.test.ts` con PostgreSQL real prueba importación interna idempotente, revisiones, contradicción, integridad de tenant y cambio de vigencia con reloj controlado. Una prueba de navegador recorre abrir run → dossier → fuente → recarga. Las fixtures de CI son sintéticas y etiquetadas; no acreditan la revisión de los eventos reales.

## Decisiones abiertas

**DECISIÓN ABIERTA D4:** URLs reales, responsable de verificación y material cuyo almacenamiento está permitido. Se implementa el recorrido con fixtures; no se cierra el criterio de catálogo real hasta completar esta curación.

## Comments

**Sesión 2026-09-08 (agente, autorización explícita de Julian para este ticket).** Sin commit ni push: los hace Julian.

### Qué se construyó

- **Migración `frontend/db/migrations/002-catalogo-curado.sql`**: catálogo materializado BAJO el tenant — `catalog_loads` (procedencia de cada carga: manifiesto, hash, responsable, fecha de verificación, etiqueta `material` synthetic/curated), `sources` y `companies` (inmutables), `organizers`/`event_editions`/`participations`/`claims` (identidades) con sus tablas `*_revisions` encadenadas por `previous_revision_id` (cadena lineal forzada con `unique nulls not distinct`; nada se actualiza ni borra: una corrección es una revisión nueva). Referencias compuestas `(tenant_id, id)` en todas las relaciones y tabla `claim_revision_sources` que materializa fuente→claim con FK compuesta: un claim no puede citar una fuente de otro tenant ni con RLS apagada (lo prueba el test con rol admin). RLS enable+force en las 12 tablas. Grants mínimos: `growthx_app` select+insert (más update solo de `catalog_loads.summary`); `growthx_worker` solo select.
- **`frontend/lib/server/evidence/store.ts`** (dir nuevo del ticket): upsert inmutable de fuentes, upsert de revisiones de claims (sujeto y fuentes verificados DENTRO del tenant vía RLS, cadena validada), lectura de claims por sujeto con la cadena completa ordenada, `orderRevisionChain` compartido.
- **`frontend/lib/server/catalog/`** (dir nuevo del ticket): `manifest.ts` (parseo ESTRICTO del manifiesto de curación: claves desconocidas rechazadas, versión antes que forma, entidades validadas con los parsers de 07, responsable y fecha de verificación obligatorios, etiqueta `material` obligatoria, extractos ≤600 chars — «público ≠ licencia de republicación» —, hash canónico); `store.ts` (`loadCuratedCatalog`: UNA transacción por manifiesto, idempotencia por hash del manifiesto Y por entidad — mismo id+mismo payload = unchanged, mismo id+otro payload = rechazo con rollback completo); `read.ts` (lecturas puras de PostgreSQL con revalidación de TODO el JSONB al leer, vigencia con instante inyectable vía la política temporal de 04, lista de catálogo con pendientes por atributo y nota declarada cuando no hay opciones vigentes — jamás seeds —, dossier de edición y expediente de organizador con cadenas completas de revisiones); `research.ts` (investigación del worker sobre el catálogo persistido: matching estructurado stack↔claims de foco, razones por atributo, pendientes, vencidos contados, límite declarado; devuelve null si el tenant nunca cargó catálogo); `fixture-manifest.ts` (manifiesto SINTÉTICO etiquetado que ejercita todos los criterios: 2 organizadores comparables con un antecedente cada uno, homónimos, coorganizador, contradicción de audiencia con 2 fuentes, costo y acceso pendientes, antecedente en Berlín, `paid_sponsor` reportado con outcome desconocido, `logo_present`, edición con alcance solo país).
- **Rutas** (server-only, sesión + RLS, 404 sin confirmar existencia ajena, sin consultar fuentes nuevas al abrir): `app/api/organizers/[id]/route.ts` (prevista por el ticket), `app/api/catalog/editions/route.ts` y `app/api/catalog/editions/[id]/route.ts` (autorizadas en sesión).
- **`frontend/lib/api/atlas-client.ts`** (autorizado): tipos espejo de la frontera nueva + `fetchCatalogEditions`/`fetchEditionDossier`/`fetchOrganizerDossier` con outcomes tipados que nunca lanzan.
- **`frontend/lib/api/opportunity-adapter.ts`** (del ticket): `projectEditionDossierView` y `projectOrganizerDossierView` — cada valor material llega con fuente/localizador, obtención vs publicación, estado del claim, método, alcance, cadena de revisiones (la contradicción muestra AMBAS con sus fuentes) y pregunta concreta cuando falta o discrepa; score/reputación no existen. Reutilizan los helpers honestos de la proyección de 07.
- **UI**: `components/atlas/catalog-dossier-panel.tsx` (nuevo, autorizado) — control mínimo del catálogo + dossier + expediente dentro del overlay del run recuperado; `components/atlas/analysis-overlay.tsx` (autorizado) monta el panel con `?run=` y actualiza el label del paso research; `components/atlas/evidence-links.tsx` (del ticket) suma `SourceRecordLinks` para las fuentes persistidas.
- **`frontend/lib/server/evaluations/run-worker.ts`** (autorizado): `research_catalog` investiga el catálogo persistido del tenant; SOLO un tenant que nunca cargó catálogo cae al fixture preparado de 08 (distinción deliberada: «sin catálogo» ≠ «catálogo sin opciones vigentes» — esto segundo se declara y no se rellena).
- **`frontend/scripts/load-curated-catalog.ts`** (del ticket): única vía de entrada del catálogo (`--manifest <ruta> | --fixture`, `--tenant <slug>`), rol growthx_app bajo RLS, avisos de cobertura (2–5 vigentes, ≥2 organizadores con antecedente) sin fabricar nada.
- **`frontend/lib/server/db/migrate.ts`** (autorizado, fix puntual): advisory lock de sesión en `runMigrations` — con dos suites de integración en paralelo los `ALTER ROLE` de `ensureRoles` chocaban intermitentemente («tuple concurrently updated»).

### Qué test lo demuestra

`frontend/tests/integration/curated-dossier.test.ts` (18 casos, PostgreSQL real; sin base se salta con aviso): parseo estricto del manifiesto (4 casos sin base), carga completa, recarga idempotente, fuente replicada sin duplicar + conflicto inmutable con rollback, corrección revisionada que conserva la anterior, 401/400, lista con vigencia y pendientes separados, dossier con contradicción/costo pendiente/fuentes abribles + proyección, homónimos e independencia (coorganizador sin herencia, insuficiencia declarada, Berlín conserva geografía), participaciones (empresa→edición→fuente, logo_present sin promoción, outcome desconocido ≠ fracaso), research persistido (worker real por rol, null sin catálogo, límite declarado en T3), tenant señuelo (rutas 404/vacío, RLS 0 filas, carga cruzada rechazada con rollback, FK compuesta violada incluso como admin), y reloj controlado (upcoming→past sin re-curar; catálogo vencido declarado, sin seeds).

Salida real (2026-09-08):

```
$ pnpm --dir frontend test
# tests 120
# pass 120
# fail 0

$ pnpm --dir frontend lint
$ eslint .
(exit 0)
```

Además: `npx tsc --noEmit` limpio, `pnpm build` OK (rutas `/api/catalog/editions`, `/api/catalog/editions/[id]`, `/api/organizers/[id]` presentes), `pnpm test:baseline` 8/8 con O1–O5 «corregido» y sin INESPERADO, y la suite completa corrida 3 veces seguidas en verde (verificación del fix de la carrera de migraciones).

**Prueba de navegador** (manual con Playwright, no versionada — misma decisión que en 08; si se versiona va con la matriz del ticket 15): abrir `/?run=<id>` con sesión dev → overlay recuperado con catálogo curado → dossier del Summit (contradicción de audiencia con ambas revisiones y sus 2 fuentes, costo pendiente con pregunta, fuente del listado abrible con href, obtención/método/alcance visibles) → expediente del organizador (claims documentados, antecedente Berlín con geografía, Quiver Labs paid_sponsor·reported con fuente, resultado no publicado ≠ fracaso) → recarga → mismos claims y revisiones. 16/16 checks. Datos de demo: `pnpm db:seed-dev` + `node scripts/load-curated-catalog.ts --fixture --tenant growthx-dev` + un POST a `/api/evaluations` procesado por `pnpm worker` (el resultado del run muestra los candidatos del catálogo persistido con pendientes por atributo).

### Desvíos y decisiones documentadas

- **Archivos fuera de la lista del ticket, autorizados por Julian en sesión (AskUserQuestion)**: rutas nuevas `/api/catalog/*` (en vez de extender las de 08), `analysis-overlay.tsx` + `catalog-dossier-panel.tsx` nuevo (montaje del control mínimo sin tocar `atlas-shell`/`globals.css`), `atlas-client.ts` (convención del cliente HTTP), `run-worker.ts` (Julian eligió migrar research al catálogo persistido) y `migrate.ts` (advisory lock, autorización específica tras detectar la carrera).
- **Archivos listados como probables que NO se tocaron**: `opportunity-drawer.tsx` (el dossier vive en el panel del run recuperado, no en el drawer de la vista v0; el drawer no monta en ese estado), `result-rail.tsx` y `world-map.tsx` (siguen siendo la vista v0; el criterio del mapa se cumple porque el dossier no depende del mapa y las ediciones curadas no generan ningún punto — `mapPoint` solo existe con respaldo urbano y la proyección declara el motivo cuando no; la reorganización del dashboard es del ticket 10).
- **Criterios 1–2 («catálogo real»)**: cumplidos a nivel MECANISMO con material sintético etiquetado, tal como el propio ticket prescribe — la D4 sigue abierta y el cierre con catálogo real verificado queda explícitamente pendiente (el material 'curated' está reservado en el esquema para ese momento).
- **«Serie»**: no se modeló como entidad nueva (los contratos de 07 no la definen y están cerrados); la independencia serie/edición se conserva porque cada edición es identidad propia y una serie puede documentarse como claim de edición. Si 10+ necesita la entidad, es un cambio de contrato explícito.
- **`date_only` con zona IANA**: la vigencia se evalúa igual de conservadora (rango completo de offsets, política de 04); refinar por zona nombrada queda para D2.
- **Fallback al fixture de 08**: se conserva SOLO para tenants sin ninguna carga de catálogo, manteniendo verde el test de integración de 08 sin tocarlo y la demo previa; con catálogo cargado el fixture no participa nunca.
- **`evaluation-run.test.ts` (08) intacto**; el fix del advisory lock beneficia a ambas suites y a `pnpm db:migrate` concurrente, sin cambio de esquema ni de comportamiento mono-proceso.
