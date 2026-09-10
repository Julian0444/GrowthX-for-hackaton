# Growth Atlas — Standards, arquitectura y calidad de datos

Revisión del 10 de septiembre de 2026. Base: `480712c`; HEAD: `ab4e4b5`; incluye el árbol de trabajo actual y los archivos nuevos mostrados por `git status --short`. Cambios relevantes: `be3fcac` (tickets 01–13) y `ab4e4b5` (14–15). Se revisaron `git diff 480712c...HEAD`, `git diff HEAD`, contratos, implementaciones y consumidores actuales.

Fuentes de estándares: `CLAUDE.md`, `CONTEXT.md`, `docs/adr/0001-arquitectura-agente-growth-atlas.md` (incluidas enmiendas), `frontend/lib/contracts/evaluation.ts`, `.scratch/evaluacion-persistida/spec.md`. Los criterios concretos de tickets se citan solo como corroboración; la revisión Spec es independiente.

No se modificó código del proyecto, arrancaron procesos ni ejecutaron suites de integración. Las reproducciones usaron imports reales y datos controlados, sin llamadas externas. La prueba de `saveDecision` usa un pool completamente en memoria: intercepta todas las queries y no conecta con PostgreSQL. Hubo dos consultas de la DB local con `BEGIN READ ONLY` y `ROLLBACK`, limitadas al tenant del run indicado por el usuario. No se imprimieron credenciales.

## Incumplimientos documentados

### S1 — P1: guardar una campaña convierte costos inferidos o contradichos en cotizaciones

**Código:** `frontend/lib/server/decisions/store.ts:158–167`; consumidor `frontend/lib/api/opportunity-adapter.ts:453–465`.

**Regla:** ADR:19, evidencia por claim con estado; `CONTEXT.md:31`, la existencia de una fuente no respalda cualquier afirmación; `evaluation.ts:58–62`, `quoted` = cotizado/publicado con soporte y `estimated` conserva su base.

`moneyClaimFromCostClaim` decide `quoted` solo por `value.kind === 'money'` y `sourceIds.length > 0`. No considera `claim.status`. `loadEditionCostClaims` (:304–321) tampoco filtra estados. Un importe inferido del organizador o una tarifa contradicha se copia a `CampaignDraftRecord` como cotización conocida, sin conservar el estado ni el motivo de contradicción. La proyección muestra `quoted` como valor conocido y solo añade advertencia a `estimated`.

**Reproducción:** `standards-probes.mjs`, `campaign_promotes_cost_to_quoted`, dos casos. Los claims `inferred` y `contradicted` pasan el parser real. `saveDecision` devuelve `saved`, con `{status:'quoted',amount:1500,currency:'USD',sourceIds:['s']}` en ambos casos. La operación de prueba usó exclusivamente un pool stub en memoria.

**Impacto:** el documento de decisión pierde incertidumbre justo al convertir la investigación en borrador ejecutable. Conservar el estado de origen y no tratar una fuente existente como cotización suficiente.

**Confianza:** alta; defecto introducido en los cambios revisados y reproducido.

### S2 — P1: la narrativa validada puede introducir costos y resultados sin evidencia, y la UI los muestra

**Código:** `frontend/lib/server/evaluations/model-adapter.ts:218–228,357–378`; consumidores `frontend/lib/api/opportunity-adapter.ts:747–751,785` y `frontend/components/research-dashboard/comparison-panel.tsx:780–786`.

**Regla:** ADR:17–19, hechos sobre snapshot y evidencia por claim; `CONTEXT.md:19,31`, atribución de resultados y soporte específico de la afirmación.

Se verifica que los IDs citados pertenezcan al candidato, pero luego se publica `proposal.summary` literal. La barrera numérica solo busca subcadenas de dígitos dentro de cualquier claim citado: una fecha respalda accidentalmente un importe. El comentario dice que no verifica semántica; eso describe una limitación, pero no cumple la invariante de no publicar hechos ajenos al soporte. El recorrido antiguo de `gemini.ts:200–203` evitaba esto conservando razones determinísticas; el nuevo vuelve a introducir texto libre factual.

**Reproducción:** con un snapshot, perfil y claim que pasan parsers reales, citar únicamente `date=2026-10-02T01:00:00Z` hace que ambos resúmenes terminen `validated`, `withheldNote:null`:

- «El patrocinio cuesta 10 USD y la audiencia está confirmada.»
- «El evento garantiza contrataciones y el acceso exclusivo ya está confirmado.»

El transporte está simulado y no se consultó Gemini. Es una prueba del validador, no una afirmación de que Gemini haya generado esos textos en una sesión real. `projectComparisonResult` sí entrega las propuestas validadas al componente, y `candidate-narrative` muestra el resumen sin otra verificación, bajo el rótulo «Lectura del modelo».

**Impacto:** el usuario ve afirmaciones sobre precio, acceso o éxito que el snapshot no contiene. Mantener razones factuales determinísticas o restringir la salida a atributos/valores admitidos; una cita válida por ID no valida una afirmación.

**Confianza:** alta.

### S3 — P1: el estado de elegibilidad pierde conflictos y pendientes de presupuesto cuando existe alguna partida conocida

**Código:** `frontend/lib/server/evaluations/eligibility.ts:213–235`; comportamiento análogo en `frontend/lib/server/evaluations/research.ts:30–34`.

**Regla:** ADR:18–19, condiciones y costo antes del score; `CONTEXT.md:23–25`, inversión condicionada por costos y restricciones. Criterio 12: «Un conflicto confirmado de fecha, acceso o presupuesto excluye antes del score; datos insuficientes generan condiciones pendientes».

Solo se compara cada partida individual con el presupuesto y solo se genera condición de costo si `supportedCosts.length === 0`. Esto falla en tres escenarios independientes y normales del mismo problema de contabilidad de restricciones:

1. Sponsorship USD 3.000 + staffing USD 3.000, ambos con soporte, con presupuesto USD 5.000: se devuelve `eligible` sin condiciones. Las partidas conocidas ya establecen un **límite inferior** superior al presupuesto.
2. Sponsorship conocido + staffing explícitamente `pending`: se devuelve `eligible` sin condición de costo.
3. Solo partidas en EUR, con presupuesto USD: tampoco se crea condición por falta de conversión; el candidato resulta `eligible` si los demás datos están soportados.

**Reproducción:** `known_total_exceeds_budget`, `known_cost_plus_unknown_line`, `foreign_currency_only`. Control con USD3.000 y condiciones respaldadas también devuelve `eligible`, como corresponde.

**Alcance cuidadosamente distinguido:** no se propone inventar ni publicar un costo total cuando hay faltantes. El contrato de campaña deliberadamente no tiene total (`evaluation.ts:402–404`). Eso no impide detectar que el límite inferior de partidas conocidas supera el presupuesto ni conservar una partida pendiente o monedas incomparables como condición. Si las partidas son alternativas mutuamente excluyentes, falta modelar esa relación; el contrato actual las trata como partidas del mismo borrador.

**Impacto:** no se hereda a la decisión una condición que el dossier sí conoce, y `saveDecision` solo bloquea candidatos ya marcados `excluded`.

**Confianza:** alta; interpretación del límite inferior explícita.

### S4 — P1: una fecha contradicha puede quedar elegible sin condición temporal

**Código:** `frontend/lib/server/evaluations/eligibility.ts:106–139`.

**Regla:** ADR:19 y `CONTEXT.md:21,25,31`: vigencia y contradicciones deben conservarse antes de decidir.

La comparación usa la fecha efectiva de la edición y `dossier.validity`, pero no consulta el estado de los claims de `date`. Si una revisión nueva contradice la fecha anterior y la edición conserva un instante futuro, el candidato queda elegible con la fecha antigua. `research.ts:26–27` sí exige soporte y comprueba `contradicted`, por lo que la misma evidencia recibe tratamientos distintos.

**Reproducción:** `date_contradicted`: fecha futura en edición; último claim `date` con `status:'contradicted'`, `note:'Sources disagree'` y fuente válida; resto de campos con soporte. Resultado real: `eligible`, `conditions:[]`. Claim y edición pasan los parsers.

**Impacto:** el snapshot no exige resolver una contradicción de fecha que afecta la posibilidad misma de ejecutar la participación.

**Confianza:** alta.

### S5 — P2: una audiencia desconocida desaparece de las condiciones de decisión

**Código:** `frontend/lib/server/evaluations/eligibility.ts:248–260`.

**Regla:** ADR enmienda v1.1: decisión condicional con acceso, audiencia y costo; `CONTEXT.md:21,25`: dossier y decisión conservan pendientes.

Solo una audiencia `contradicted` crea condición. Una audiencia ausente o `pending` no la crea, aunque se identifica como pendiente en la lectura del dossier (`catalog/read.ts:300–302`). Con fecha, lugar, acceso y una partida de costo respaldados, el candidato se declara `eligible` sin condiciones de audiencia. El borrador hereda `alternative.conditions`, por lo que tampoco obtiene automáticamente esa pregunta abierta.

**Reproducción:** `audience_pending`: claim válido con `{kind:'pending',note:'Unknown'}`, `status:'pending'`; resultado `eligible`, `conditions:[]`.

**Impacto:** se omite una incertidumbre esencial para afinidad y compra. No se pide excluir por desconocimiento, sino mantener la condición visible y guardada.

**Confianza:** alta.

### S6 — P2: confirmar evidencia puede eliminar al organizador y sus ediciones de la investigación

**Código:** `frontend/lib/server/evaluations/research.ts:12,22–27,68–74,80`.

**Regla:** `evaluation.ts:35–47` define `confirmed` como confirmado por revisión; ADR:19 exige conservar el estado por claim; la investigación debe usar antecedentes respaldados.

El predicado `supported` admite `observed`, `reported` y `announced`, pero omite `confirmed`. Lo mismo sucede con la lista de estados de participación en :80. Una revisión humana que fortalece la evidencia deja de aportar razones de matching; si era la única razón, :84 elimina al organizador. Lugar/fecha confirmados dejan de habilitar una edición futura.

**Reproducción pura:** `confirmed_stronger_evidence_not_supported`: todos los claims del caso base pasan de `observed` a `confirmed`; `futureSfConditions` pasa de lista vacía a «Falta fuente urbana verificada…» y «Fecha sin soporte concluyente». El efecto sobre matching está trazado estáticamente a :69,84; no se mutó la DB para demostrarlo.

**Confianza:** alta para predicado y ediciones; alta por código para desaparición del único match.

## Heurísticas de arquitectura, separadas de incumplimientos duros

### H1 — P2, posible Duplicated Code: dos políticas de fecha divergen entre búsqueda y comparación

**Hunks:** `research.ts:28–29` usa `edition.startDate.iso.slice(0,10)`; `eligibility.ts:48–74,125` usa el día en la zona declarada.

La misma restricción se mantiene en dos implementaciones. El arreglo de zona horaria del árbol actual se aplicó solo al evaluador de comparación. Esto produce una diferencia observable, no un reclamo de estilo.

**Reproducción:** `same_event_window_disagreement`, evento `2026-10-02T01:00:00Z` en `America/Los_Angeles` (1 de octubre a las 18:00); ventana del comprador `2026-10-01`…`2026-10-01`. Investigación: «Fuera de la ventana indicada». Comparación: `eligible`. El evento correcto desaparece de `futureSfEditionIds` en el camino de organizadores, aunque la comparación lo admite. Reunir la regla de calendario/alcance/soporte detrás de un módulo de dominio compartido reduciría la divergencia.

**Confianza:** alta en el comportamiento; la clasificación Duplicated Code y la dirección de refactor son heurísticas, no regla obligatoria. La omisión de `confirmed` también es consistente con la dispersión de listas de estados, pero no se contabiliza dos veces.

Se consideró la lista completa de smells del skill. No se presentan nombres, wrappers, switches o tamaño de archivos como hallazgos sin impacto. La dependencia de módulos server sobre tipos y helpers de `components/research-dashboard` es una señal de ubicación de responsabilidades, pero no se cuenta como violación separada: los imports actuales usados en esas funciones son puros.

## Datos reales que estaba ofreciendo la sesión, antes de las importaciones de esta revisión

Consulta directa con transacción **READ ONLY** al run `26a23cd6-f624-4ecd-b9ce-978d934ef341`; el servidor lo vincula al tenant `c7537625-27d8-4332-a090-a996ca80b947`. Se leyó ese tenant únicamente. No se extrajo información de sesiones/credenciales.

El run está `completed`, workflow `sf-organizers/1`. Su resultado guardado declara `organizers:4`, `editions:7`, `matched:2`, materiales `synthetic` e `imported`.

En el momento de la lectura había una carga `catalogo-sf-fixture-sintetico`, verificada por «Curaduría sintética (fixture de CI)», y tres cargas de importación Luma. **Cero cargas `curated`.** Las cuatro identidades de organizadores eran:

- Bay Builders Collective (synthetic).
- Golden Gate ML Circle (synthetic).
- Mission AI Collective (synthetic), dos identidades distintas del fixture de homónimos.

Las dos relaciones empresa–edición eran sintéticas: Quiver Labs como `paid_sponsor/reported` en Berlín 2025, y Nimbus como `logo_present/observed` en GG ML 2025; ambos outcomes comerciales eran `unknown`. No apareció un claim de proyecto publicado o resultado real en la consulta de atributos `project`, `sponsor`, `outcome` y audiencia. Esta ausencia se describe respecto del catálogo almacenado, no de lo que puede existir en la web.

Las siete ediciones eran cinco del fixture, un evento sintético de QA importado dos veces y **una edición de apariencia real**, `Software Factories Meet Production` (`https://lu.ma/87no10np`), cuyo dossier conserva fuente `http_get+jsonld_extraction` y hash, sin organizadores enlazados. Esa lectura de DB por sí sola no verificó la página externa. Los tres registros de importación preexistentes eran los runs `a1291303-dc6f-499e-9378-c9b9b1ecc40a`, `aa2ec2c7-4a05-4b81-9931-854798701770`, `066de569-697e-412a-b9ab-7b464d729041`.

**Interpretación:** no hay fraude automático demostrado: los nombres/materiales sintéticos están etiquetados. Sí está demostrado que la investigación de organizadores que vio el usuario estaba sostenida por fixtures; no constituía una investigación comercial real de los sponsors y proyectos que espera encontrar. Las importaciones realizadas posteriormente por root para verificar páginas no deben contabilizarse como catálogo preexistente.

La importación de producción actual solo persiste campos JSON-LD básicos (`luma-adapter.ts:309–318,588–615`). Registra el nombre del organizador como claim, deja `organizerIds:[]` para una identidad nueva, no construye participaciones y deja audiencia/costo pendientes. Esto limita que una página rica en texto alimente el dossier, pero ampliar scraping/investigación no estaba autorizado por el slice; se registra como límite de producto/datos, no como incumplimiento de implementación por sí solo.

## Qué queda demostrado y qué no

- `standards-probes.mjs` ejecutó 12 observaciones con assertions sobre comportamiento actual, incluyendo un control positivo. Perfil, claims, revisión de edición y snapshot relevantes se validan con parsers del repo. Las assertions que pasan confirman las reproducciones del defecto; **no significan que la app pase esos requisitos**.
- Resultado capturado en `standards-probes.jsonl`.
- No se ejecutaron tests de integración, migraciones, worker ni servidor en este subtask; root/otro revisor gestionan su evidencia por separado.
- No se probó explotación de autorización o aislamiento ni se observó un cruce de tenants. Las consultas revisadas usan contexto de tenant; no se reporta una vulnerabilidad especulativa.
- No se propone reactivar un ranking numérico: `approvedPolicyFor` devuelve null deliberadamente hasta D2. Tampoco se clasifica como bug la ausencia de outcomes/CSV, scraping autónomo o monitoreo, fuera del corte vigente.

**Conteo de este eje:** 6 incumplimientos documentados y 1 heurística con impacto reproducido. Las limitaciones del catálogo se reportan aparte y no inflan el conteo de defects.
