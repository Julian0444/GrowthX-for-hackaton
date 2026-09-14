# DP-03 — Definir un brief operativo y contratos compartidos

Status: ready-for-agent
Execution: verified

**Fase:** B — Frontera común.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-01](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/01-caso-real-y-fuentes.md>).

## Objetivo

Hacer que producto, objetivo y restricciones definan una investigación concreta y acordar la forma de datos consumida por investigación, lista, mapa y decisión.

## Alcance y dependencias

Extender los contratos existentes con compatibilidad de registros anteriores. Definir revisión del brief, hallazgos, fuentes con fragmentos, progreso, consumo y ubicación con precisión. El contrato de mapa no obliga a tener coordenadas para que una oportunidad exista.

## Criterios de aceptación

- [x] Entrada editable con producto, audiencia, objetivo declarado/provisional, definición de éxito opcional, presupuesto/moneda, fechas, SF, formatos, restricciones y comparables aportados.
- [x] Persistir la revisión del brief; no forzar siempre provisional, success pending o restrictions vacías cuando el usuario sí declaró esos datos.
- [x] Definir estados de investigación, hallazgo y evidencia con semántica de parcial/error/insuficiente; no publicar fixtures como degradación de investigación real.
- [x] Usar una identidad y revisión de edición para lista, marcador, dossier y comparación; incluir selectedEditionId como estado de presentación compartido.
- [x] Definir dirección pública estructurada, coordenadas, precisión (venue/address/street/city/unknown o equivalente), método y sourceIds. Migrar o decodificar registros anteriores sin asumir precisión.
- [x] Definir relaciones de organizador, sponsor y proyecto con fuente/fragmento/edición; si se extiende un subject o contrato, actualizar parsers, DB y adaptadores juntos.
- [x] Separar costo operativo de investigación de presupuesto comercial; especificar cupos y consumo conocido/desconocido por proveedor.
- [x] Registrar una enmienda de dirección en el ADR/CONTEXT cuando la implementación comience: investigación web central y mapa integrado. No reabrir la infraestructura durable ni mantener reglas antiguas incompatibles en paralelo.

## Demostración

Cambiar el objetivo y la audiencia de un brief y mostrar las preguntas de investigación resultantes; guardar y volver a leer la revisión.

## Qué lo verifica

Parsers runtime, validación de campos, round trip persistido, lecturas de registros anteriores y tenant ajeno. Comprobar que presupuesto comercial y costo de proveedor no se mezclan.

## Módulos y archivos orientativos

- `frontend/lib/contracts/evaluation.ts`
- `frontend/lib/contracts/evaluation-validation.ts`
- `frontend/lib/server/evaluations/wire.ts`
- `frontend/lib/server/evaluations/service.ts`
- `frontend/lib/api/`
- `frontend/db/migrations/`
- `CONTEXT.md`
- `docs/adr/0001-arquitectura-agente-growth-atlas.md`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No convertir el brief en un CRM ni construir un grafo genérico. La lectura automática del sitio de empresa puede esperar si la descripción editable permite el recorrido.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.

Referencia de DP-01 afinada tras revisión: consumir R1–R15 junto con el [registro por afirmación](../evidence/dp-01-afirmaciones.md), no una cita de página para todos los atributos. El premio de un proyecto, su herramienta declarada y su eficacia técnica son afirmaciones distintas; esta última sigue sin soporte. El [antes/después](../evidence/dp-01-caso-y-fuentes.md#antes-hallazgo-después-y-condición-de-avance) es ilustrativo y no una decisión comercial observada. Esta nota no ejecuta DP-03.

Inicio DP-03 (10/09/2026): ticket, spec y plan leídos; producto consultado (brief, investigación, fuentes/relaciones, mapa, presupuesto). DP-01 verified contrastado con su matriz, caso y soporte por afirmación R1–R15. Se conserva el árbol previo registrado en `/tmp/dp03-initial-worktree.json`. Alcance tomado: brief editable y revisión persistida, preguntas derivadas, contratos runtime y consumidores de evidencia/ubicación/relaciones/progreso/consumo, compatibilidad e aislamiento.


Cierre DP-03 (10/09/2026): **verified** contra los ocho criterios. El brief editable conserva objetivo declarado/provisional, éxito, restricciones, moneda y demás entradas; genera preguntas específicas y guarda el plan ligado a la versión del perfil. Se extendieron contratos y validación runtime de hallazgos/progreso, fuentes con fragmentos, relaciones por edición, ubicación con precisión y cupos/consumo por proveedor. Lista, pin, dossier y comparación comparten identidad/revisión; los snapshots no leen la revisión actual como sustituto. La investigación sin catálogo informa cobertura insuficiente y no devuelve fixtures de relleno.

Verificación: **245 pruebas de funciones/integración y 26 comprobaciones E2E aprobadas, sin fallos ni omisiones**, TypeScript, ESLint y build de producción. PostgreSQL/Next/worker aislados comprobaron dos revisiones del brief con audiencia/objetivo/moneda distintos, preguntas resultantes, recarga/relectura intacta de v1, compatibilidad de registros anteriores y rechazo de acceso/referencias de otro tenant. La muestra A03/A08/A09 de DP-01 separa premio y herramienta, con fragmentos específicos. Se revisaron capturas desktop/móvil y el formulario en localhost:3000; no se escribió en la DB del usuario. [Matriz, resultados, capturas, archivos y handoff técnico](../evidence/DP-03/README.md).

Persistencia: las extensiones usan los JSONB versionados existentes; no requieren migración SQL ni reescritura histórica. Se enmendaron ADR/CONTEXT al comenzar, conservando PostgreSQL, cola y worker. Los cambios previos se conservaron; solo se actualizaron acotadamente los archivos compartidos necesarios. Sin commit, push, despliegue ni mensajes externos.

Límites: los contratos de progreso/consumo están definidos y validados; sus productores, cuotas agregadas y medición Exa/Apify pertenecen a DP-04/05. Ambos proveedores quedan deshabilitados con cupo por run cero, distinto de consumo conocido cero; los topes de iniciativa USD 10/15 no se multiplican por run. La referencia de DP-01 se serializó en pruebas, sin presentarla como nueva investigación web. El mapa sigue siendo SVG; geocodificación/calles y nuevas importaciones con precisión corresponden a DP-08/09. Enriquecimiento automático de relaciones y aceptación comercial continúan en sus tickets. DP-04 y DP-05 quedan habilitados por esta dependencia, todavía pendientes de ejecución.
