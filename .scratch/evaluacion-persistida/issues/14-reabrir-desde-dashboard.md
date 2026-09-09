# 14 — Reabrir la decisión exacta desde el dashboard

Status: ready-for-human

**Estado:** implementado con autorización explícita de Julian (2026-09-09; la autorización reemplaza los avisos de «no autorizado» y cubre solo este ticket); listo para revisión humana. Ver `## Comments`.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [13](./13-guardar-decision-condicional.md).

## Objetivo

Hacer que una segunda consulta desde la UI actual recupere la evaluación y decisión guardadas sin recalcularlas ni reemplazarlas por una nueva búsqueda.

## Aristas de bloqueo

13 → 14: necesita una decisión guardada con revisiones y su campaña para demostrar lectura trazable tras cerrar la UI.

## Criterios de aceptación

- [x] La UI del dashboard ofrece una lista mínima de evaluaciones guardadas del tenant, con estado, fecha, perfil, evento y acceso a la decisión. No se crea un producto separado de historial.
- [x] Cerrar panel/pestaña y volver por la lista o enlace interno recupera `runId`, `snapshotId`, revisión de decisión y campaña originales desde PostgreSQL, incluso después de reiniciar Next.
- [x] La segunda consulta es una lectura por identidad/filtros explícitos de perfil, no una búsqueda semántica de conversaciones. Presupuestos u objetivos diferentes no se mezclan porque coincida el texto del producto.
- [x] Esa lectura no llama a Luma, Exa, Apify ni al modelo; tampoco dispara refrescos silenciosos, fixtures o nuevos scores. El dashboard, la lista de organizadores y el panel proyectan el snapshot guardado.
- [x] Las evidencias y motivos muestran su fecha/revisión original. Si el evento ha vencido desde entonces, se agrega un aviso de vigencia actual sin alterar el resultado histórico.
- [x] «Reevaluar» es una acción explícita que crea otro run con vínculo al anterior; permite usar nuevas revisiones y mantiene disponible la decisión previa. No es una edición encubierta de un snapshot.
- [x] El contrato legado de lectura de Launch Room no queda como atajo a información en memoria o sin tenant. Las rutas usadas por el slice aplican la misma autorización y muestran errores distinguibles de «no hay decisión».
- [x] Se preservan selección y regreso en dashboard → organizador → evento → campaña. El mapa local es opcional; el camino completo funciona sin abrirlo y no inventa ubicaciones.

## Demostración

Guardar una elección condicional, copiar su enlace interno, cerrar la app, reiniciar Next y volver. La pantalla muestra la misma evidencia y los mismos motivos con cero llamadas externas. Después crear una reevaluación y navegar a ambas versiones.

## Módulos y archivos probablemente afectados

`frontend/components/atlas/atlas-shell.tsx`, `frontend/components/atlas/result-rail.tsx`, `frontend/components/atlas/opportunity-drawer.tsx`, `frontend/components/atlas/campaign-panel.tsx`, `frontend/lib/api/atlas-client.ts`, `frontend/lib/api/opportunity-adapter.ts`, `frontend/app/api/decisions/[id]/route.ts`, rutas de evaluaciones.
Nuevos previstos: componente pequeño de lista de evaluaciones y `frontend/tests/e2e/reopen-evaluation.spec.ts`.

## Qué test lo demuestra

`reopen-evaluation.spec.ts`, con Next, worker y PostgreSQL reales: guardar → cerrar contexto del navegador → reiniciar Next → volver a autenticar → reabrir → cotejar IDs, motivos, claims y campaña. Contador del proveedor debe permanecer en cero durante lectura. Un segundo presupuesto crea otro perfil/run y nunca sustituye el anterior.

## Decisiones abiertas

**DECISIÓN ABIERTA D3:** acceso del usuario real al reabrir. La prueba de CI usa sesiones de test controladas; no acepta IDs de tenant elegidos por el cliente.
No se necesita decidir exportación o compartir públicamente para tener un enlace interno autenticado.

## Comments

Implementado el 2026-09-09. Sin commit ni push (los hace Julian). Autorización explícita de Julian: cambio a `ready-for-agent` antes de empezar y, vía AskUserQuestion (opción «Todo»), el alcance ampliado: `components/research-dashboard/research-dashboard.tsx` y `comparison-panel.tsx` (el dashboard y el «panel actual» viven ahí desde 10–13; `atlas-shell.tsx` es un wrapper), `research-types.ts`, `lib/server/evaluations/dashboard-store.ts`, `lib/server/evaluations/wire.ts` + `service.ts` (vínculo `previousRunId` de la reevaluación), `package.json` (el e2e nuevo entra en `pnpm test`) y `app/api/decisions/route.ts` (400 por `snapshotId` malformado).

### Qué se hizo

- **Lista mínima de evaluaciones guardadas (criterio 1)** — `dashboard-store.ts › readSavedEvaluations` + `readEvaluationProfiles`: `GET /api/evaluations` suma `evaluations` (runs `investment_comparison` con estado, fechas de creación y de evaluación, perfil —producto, versión, presupuesto, objetivo, ventana—, ediciones comparadas con nombre, snapshot y la ÚLTIMA revisión de cada decisión con su fecha original, condiciones abiertas y el borrador confirmado con ella), `evaluationProfiles` (opciones del filtro) y `evaluationFilter`. Filtro EXPLÍCITO por identidad de perfil `?profileId=` (uuid; malformado → 400 `invalid_query`): nunca por texto de producto, así dos perfiles con el mismo producto y distinto presupuesto u objetivo no se mezclan. Componente nuevo `components/research-dashboard/evaluation-list.tsx` montado en la sección **Decisiones** del dashboard (no es un producto de historial aparte): «Abrir decisión», «Abrir campaña», enlace interno (`<a href>` + copiar), vínculo a la evaluación anterior en reevaluaciones, «Sin decisiones registradas» distinguible de «sin snapshot». Entrar a Decisiones relee la lista (lectura por identidad).
- **Enlace interno y selección recuperable (criterios 2 y 8)** — la URL lleva `?run=<runId>&decision=<decisionId>&view=campaign` (`evaluationHref` / `parseEvaluationFocus`); el dashboard guarda el foco (`focus`) y lo escribe con `replaceState`; el panel enfoca la decisión (`scrollIntoView`, `data-decision-id`) y abre directamente el borrador de campaña. `CampaignDraftPanel` muestra su meta de origen (`CampaignDraftMeta`: run, snapshot, revisión y fecha de la decisión, enlace interno). Desde el panel se abre el dossier de la edición y el expediente del organizador (botones nuevos); «Volver a …» restaura la comparación con la misma decisión enfocada y la campaña sigue a un click. El mapa no se abre en ningún paso del recorrido y no se inventa ninguna ubicación.
- **Lectura sin recálculo (criterios 3 y 4)** — reabrir = `GET /api/evaluations/:id` (el `runs.result` persistido) + `GET /api/decisions?snapshotId=` (y `GET` del run anterior en reevaluaciones). Ninguna llamada a Luma, Exa, Apify ni al modelo; sin fixtures ni pipeline mundial; ningún score nuevo. `projectComparisonResult(result, { readAt })` proyecta el snapshot tal cual.
- **Fecha/revisión original y vigencia actual (criterio 5)** — por candidato, `fixedRevisions` (revisión de edición y de organizador fijadas por el snapshot, con su fecha, y los claims fijados) y `currentValidity`: aviso si el inicio declarado ya pasó respecto del instante de lectura y NO había vencido al evaluar (política temporal de 04); no altera estado, condiciones ni score («el resultado histórico no se altera; una reevaluación crea otro run»). El panel muestra «obtenido <fecha>» en los campos conocidos, la línea de revisiones fijadas, la decisión con «revisión N · registrada el <decidedAt>», el historial de revisiones conservadas (`<details>`) y las fuentes con su fecha de obtención.
- **Reevaluar (criterio 6)** — botón explícito «Reevaluar (nuevo run vinculado)» en el panel → `startComparison` con `previousRunId` (nuevo en `ComparisonStartBody`: parseo estricto uuid, forma parte del hash del payload; `acceptComparison` valida bajo RLS que sea una comparación del tenant —ajena/inexistente → 400— y lo persiste en `runs.input`; `getRun` ya lo exponía). El nuevo run reutiliza el mismo perfil (`profileRunId` = el run actual, que comparte `profile_id`) y el mismo conjunto de ediciones; el worker evalúa con las revisiones vigentes del catálogo. El panel del nuevo run muestra «Reevaluación de la evaluación anterior <run> (snapshot …)» y, por candidato, la «Decisión previa» con su revisión, fecha y enlace; la lista muestra el vínculo. Nada del run/snapshot/decisión anterior se edita (append-only por grants desde 12/13). Reintentar una aceptación incierta conserva la clave idempotente; una nueva reevaluación explícita usa otra.
- **Errores distinguibles y contrato legado (criterio 7)** — `GET/PATCH /api/decisions/:id` y `GET /api/decisions?snapshotId=` devuelven 400 (`invalid_id` / `invalid_query`) ante ids malformados (antes: 500 por el cast de uuid); 401 / 404 (sin confirmar existencia ajena) / 503 (modo degradado) se conservan en todas las rutas del slice. El panel distingue «leyendo decisiones» (no ofrece «Registrar decisión» hasta terminar), «no disponible» (con reintento), «sin sesión», «decisión enlazada inexistente en este snapshot» y «sin decisión». La Launch Room no queda como atajo: no existe ninguna lectura en memoria ni sin tenant (`decisions/store.ts` es PostgreSQL bajo RLS desde 13); solo sobreviven sus TIPOS en el contrato v0 congelado (`lib/contracts/growxth.ts › L5`), sin consumidores (verificado con grep en `lib`, `app`, `components`, `tests`).
- **Cosmético** — la caja de progreso dice «Evaluación» para runs de comparación y «Abrir evaluación anterior (esta es una reevaluación)» en vez de «investigación anterior».

### Qué test lo demuestra

`frontend/tests/e2e/reopen-evaluation.spec.ts` (nuevo; corre en `pnpm test` y `pnpm test:e2e`) — Next, worker y PostgreSQL REALES, catálogo sintético controlado (fixture de 09 con fechas relativas + una edición de SF con costo COTIZADO de USD 1500 con fuente), 6 subtests:

1. **Guardar** — investigación (perfil v1, presupuesto no declarado) y comparación por API → navegador: elegir el summit con motivos + condición completa (pregunta, respuesta esperada, efecto, responsable, plazo) → la campaña persistida se abre con run/snapshot/revisión 1 y su enlace interno (= la URL); descarte de otra alternativa sin campaña; lo leído por `GET /api/decisions/:id` es exactamente lo guardado. Se cierra el contexto del navegador, se apaga el worker y **se apaga Next**.
2. **Reiniciar Next y reabrir por el enlace interno** — contexto nuevo, misma sesión: campaña con el MISMO id, decisión, snapshot y revisión; «Volver» muestra la decisión enfocada con motivos, condición (responsable), fecha original de la revisión, claims fijados (`clm-summit-access-r1`, `clm-summit-cost-r1`, edición `…-r1`), fuentes con `obtained 2026-09-08`, el descarte, y «Registrar decisión» solo donde no hay decisión. **Cero llamadas**: contador del navegador (proveedores + pipeline mundial + importador + cualquier POST/PATCH durante la lectura) en cero, invariantes en PostgreSQL (runs, snapshots, decisiones, campañas, claims, perfiles, jobs pg-boss) idénticas al baseline y worker apagado. Errores distinguibles: 200 / 400 (id malformado, `snapshotId` malformado, `profileId` malformado) / 404 (inexistente y tenant señuelo) / 401; el señuelo ve listas vacías.
3. **Lista y regreso** — Decisiones muestra la evaluación (run, snapshot, perfil v1 «presupuesto no declarado · objetivo feedback», nombres de ediciones) con sus dos decisiones (revisión, campaña, enlace); «Abrir decisión» → panel enfocado → expediente del organizador → dossier de la edición → «Volver a decisiones» → misma decisión → «Abrir borrador de campaña persistido» con el mismo id. `sf-map` nunca montado. Invariantes intactas.
4. **Vigencia actual** — contexto aparte con `clock.setFixedTime` (dos años después): aviso «ya pasó respecto de la lectura … no se altera» en el candidato, con el MISMO estado histórico («Condicionado»), la misma revisión y el mismo snapshot.
5. **Reevaluar** — `previousRunId` inexistente → 400; el botón crea otro run con `previousRunId`, otro snapshot y el mismo perfil; nota de reevaluación, «Decisión previa … revisión 1» con enlace, sin decisión propia en el nuevo snapshot; la decisión anterior (`deepEqual` con la lectura original) y el `runs.result` anterior no cambian; conteo de decisiones invariante; navegar a ambas versiones desde el panel y desde la lista.
6. **Segundo presupuesto** — investigación v2 (500 USD declarados, `previousRunId` de la v1) + comparación del mismo conjunto: la edición cotizada queda «excluded» en el snapshot nuevo y «conditional» en el anterior (que sigue `deepEqual`); la lista muestra tres evaluaciones y el filtro por perfil (identidad) deja 2 para v1 y 1 para v2; `GET /api/evaluations?profileId=` devuelve solo runs de esa versión con el resumen de la decisión (veredicto, revisión, campaña, fecha original).
   Guarda adicional en las tres comparaciones: la redacción debe ser `deterministic_only` con motivo «GEMINI_API_KEY ausente» — si un worker ajeno con claves procesara los runs (cola compartida), el test falla con un mensaje explícito en vez de dejar pasar llamadas al proveedor.

### Salida real de verificación

```text
$ pnpm --dir frontend test        (exit 0)  ← corrida completa en verde
# tests 159     # tests 11     # tests 7        (node --test suite · e2e ticket 10 · e2e ticket 14)
# pass 159      # pass 11      # pass 7
# fail 0        # fail 0       # fail 0
# cancelled 0   # cancelled 0  # cancelled 0
# skipped 0     # skipped 0    # skipped 0
# todo 0        # todo 0       # todo 0

$ pnpm --dir frontend lint        (exit 0)
$ eslint .
(sin errores ni warnings)

$ pnpm --dir frontend test        (exit 1)  ← dos corridas posteriores, tras los dos retoques cosméticos
# tests 159 / pass 159 / fail 0             (suite node --test: verde)
# tests 11 / pass 6 / fail 5                (e2e del ticket 10: sf-organizer-research.spec.ts)
    not ok 1 - entrada dashboard, sesión y perfil corregible antes de investigar
      Expected values to be strictly equal: + actual 'completed' / - expected 'queued'
      (sf-organizer-research.spec.ts:178 — el test asume que ningún otro worker escucha la cola)
    not ok 2/3/4/6/8 - "Cannot read properties of undefined (reading 'result')"  (cascada de firstRun)
(el e2e del ticket 14 no llegó a ejecutarse por el && del script)

$ node --test tests/e2e/reopen-evaluation.spec.ts   (exit 0)  ← e2e del ticket 14 solo, misma máquina, mismo momento
    ok 1 - guardar una elección condicional, ver su campaña y copiar el enlace interno
    ok 2 - reiniciar Next y reabrir por el enlace interno: mismos IDs, motivos, claims y campaña; cero llamadas externas
    ok 3 - lista de evaluaciones por identidad y regreso dashboard → organizador → evento → campaña
    ok 4 - vigencia actual con reloj controlado: aviso sin alterar el resultado histórico
    ok 5 - reevaluar crea otro run vinculado; la decisión previa sigue disponible sin ediciones encubiertas
    ok 6 - un segundo presupuesto crea otro perfil y otro run; nunca sustituye el anterior
# tests 7 / pass 7 / fail 0
# Next reiniciado una vez; 0 llamadas prohibidas durante la lectura; catálogo sintético explícito.

$ npx tsc --noEmit --incremental false   (exit 0)
$ pnpm --dir frontend build              (exit 0; rutas /api/decisions, /api/decisions/[id], /api/evaluations presentes)
$ pnpm --dir frontend test:baseline      (8/8; O1–O5 «corregido», sin INESPERADO)
```

**Sobre las dos corridas completas en rojo:** durante esta sesión corren en el workspace un `next dev --webpack` (PID 88154) y un worker de desarrollo `node --env-file=.env.local worker/index.ts` (PID 99139, con claves reales) que NO son de esta sesión y no se tocaron. Ese worker comparte la cola pg-boss con los tests: en la corrida verde perdió la carrera; en las dos siguientes procesó el run del e2e de 10 antes de que ese test arrancara su propio worker, y su aserción «el run sigue `queued`» falla (con cascada). No es un efecto de este ticket (ningún archivo del e2e de 10 ni de su recorrido cambió); el e2e de 14 no depende de esa suposición y además detecta explícitamente a un worker ajeno con claves. Para dejar `pnpm test` verde: apagar el worker de desarrollo antes de correrlo (anotado también en la memoria del proyecto `infra-local-ticket-08`).

### Desvíos y límites documentados

- **Alcance autorizado en sesión** (AskUserQuestion «Todo»): además de los archivos del ticket, `research-dashboard.tsx`, `comparison-panel.tsx`, `research-types.ts`, `dashboard-store.ts`, `evaluations/wire.ts`, `evaluations/service.ts`, `package.json` y `app/api/decisions/route.ts`. El componente nuevo quedó en `components/research-dashboard/evaluation-list.tsx`.
- **Listados como probables y NO tocados:** `atlas-shell.tsx` (wrapper de `ResearchDashboard` desde 10), `result-rail.tsx` y `opportunity-drawer.tsx` (vista v0; la decisión vive en el panel de comparación desde 13). `campaign-panel.tsx` sí cambió (meta de origen del borrador; `CampaignPanel` v0 intacto).
- **Instante de lectura del aviso de vigencia = reloj del navegador** (`readAt` inyectable en `projectComparisonResult`): es una proyección sobre el snapshot persistido, nunca altera el resultado; el e2e lo prueba con el reloj controlado de Playwright en un contexto aislado. Si se prefiere el instante del servidor, es un campo nuevo de `EvaluationRunView` (no se tocó).
- **La lista incluye solo runs `investment_comparison`:** los runs de investigación siguen en «Investigaciones guardadas» (Resumen) y los de importación Luma se recuperan por `?run=` como hasta ahora; no tienen decisión.
- **`DecisionRead` no trae `runId`** (no se tocó `decisions/store.ts`): el enlace interno siempre lleva `run=`; la lista provee run + decisión. Un `?decision=` sin `run=` no se resuelve.
- **Reevaluar reutiliza perfil y conjunto:** cambiar el perfil es otra investigación (Perfil → investigar → comparar), como demuestra el subtest 6 por API.
- **Contrato v1 sin cambios** (07 cerrado): `fixedRevisions`, `currentValidity`, `SavedEvaluation` y `CampaignDraftMeta` son tipos de vista/lectura, no del contrato.
- **`next-env.d.ts`** quedó modificado por `pnpm build` (artefacto generado, fuera de alcance) y se restauró con `git checkout`.
- **Infra local:** sin migración nueva. El e2e borra sus tenants `reopen-e2e-%`, cancela sus jobs y no dejó directorios temporales; ningún proceso de esta sesión quedó corriendo (los dos ajenos siguen vivos). Memoria del proyecto `infra-local-ticket-08` actualizada con la nota del worker ajeno y la cola compartida.
- **D3 abierta:** el e2e usa sesiones de test insertadas en `growthx.sessions` (token opaco), como 08–13; no acepta ids de tenant del cliente.
