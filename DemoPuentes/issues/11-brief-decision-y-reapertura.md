# DP-11 — Guardar un brief accionable y reabrir la evidencia original

Status: ready-for-agent
Execution: verified

**Fase:** E — Resultado durable.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-07](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/07-comparacion-y-recomendacion-explicable.md>), [DP-10](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/10-experiencia-investigacion-y-evidencia.md>).

## Objetivo

Entregar una decisión útil para el equipo y conservar exactamente las fuentes y condiciones que la sustentaron.

## Alcance y dependencias

Completar campos esenciales de decisión/campaña y navegación histórica. Reutilizar transacciones y revisiones actuales.

## Criterios de aceptación

- [x] Guardar explorar primero, elegir con condiciones, descartar o pendiente con motivos según el modelo acordado; no inventar una oferta de participación.
- [x] Permitir completar modalidad propuesta/ofrecida, objetivo, preguntas, responsable y costos aportados con su estado; no enviar siempre campaignDraft:null.
- [x] Las condiciones heredadas de audiencia, acceso, costo y fecha permanecen visibles y resolubles con respuesta atribuida y soporte.
- [x] Reabrir el enlace conserva brief, snapshot, fuentes, relaciones y coordenadas originales. Abrir dossier desde comparación histórica no carga silenciosamente el catálogo actual.
- [x] Modificar motivos o resolver condiciones crea revisión con control de concurrencia; no perder texto en conflicto entre pestañas.
- [x] Copiar brief o mensaje produce contenido verificable, incluyendo evento/enlace, contexto, condiciones y siguientes preguntas; comprobar el clipboard además del toast.
- [x] Guardar o copiar no manda mensajes, reserva actividades ni compromete dinero. Los acuerdos declarados por el comprador se atribuyen a él.
- [x] Actualización de datos requiere una acción y revisión nueva; un resumen completo de cambios puede quedar posterior si se mantiene esta separación.

## Demostración

Elegir con una pregunta concreta, copiar el texto, cerrar y reabrir. Reimportar una fuente y comprobar que la decisión anterior conserva evidencia y mapa de su revisión.

## Qué lo verifica

Integración de decisiones y revisión con DB aislada; Chrome reapertura y clipboard, conflicto entre pestañas, actualización de catálogo y dossier/pin históricos, tenant ajeno.

## Módulos y archivos orientativos

- `frontend/lib/server/decisions/store.ts`
- `frontend/lib/server/evaluations/snapshot-store.ts`
- `frontend/lib/api/opportunity-adapter.ts`
- `frontend/components/atlas/campaign-panel.tsx`
- `frontend/components/research-dashboard/comparison-panel.tsx`
- `frontend/components/research-dashboard/research-dashboard.tsx`
- `frontend/tests/e2e/reopen-evaluation.spec.ts`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No envío externo ni ejecución de campaña. No construir un sistema de outcomes, aprobación corporativa o seguimiento de leads.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.

Inicio DP-11 (10/09/2026): ticket completo, spec/plan, producto y handoff leídos. DP-07/10 verified contrastados con sus cierres, evidencia y código actual. Se conservan archivos/hashes en preflight y copia privada. Se reutilizan transacciones append-only, revisiones esperadas, snapshot y navegación histórica existentes; se completan edición, atribución y copia verificable. DB/worker/E2E en puerto propio 55461 y build en copia propia; integración posterior en localhost sin reset de datos.


Cierre DP-11 — 10/09/2026: **8/8 criterios comprobados**. Se completaron los cuatro estados de decisión, el brief editable con responsable/modalidad/preguntas/costos, atribución de respuestas y ofertas, enlaces de revisión exacta y copia con resultado real del clipboard. Se reutilizan transacciones, RLS, revisiones append-only y el snapshot; no hay migración SQL nueva. Los registros antiguos siguen legibles, incluidas fuentes derivadas de sus revisiones fijadas.

**Evidencia:** [matriz y reproducción](../evidence/DP-11/README.md), [resumen final](../evidence/DP-11/verification-summary.json), [Chrome real](../evidence/DP-11/real-browser.json), [clipboard original](../evidence/DP-11/real-clipboard.txt), [manifest de archivos](../evidence/DP-11/verified-files.json). 349 comprobaciones de funciones/integración y 29 casos de navegador distintos (33 resultados con contenedores), sin fallos ni skips; build/TypeScript, lint y diff check correctos. DB/worker/E2E en 55461 y build propio; nunca se usó la DB compartida para las suites.

En localhost se guardó explorar AIT con brief y pendiente Security. Dos pestañas crearon revisiones 2 y 3 con conflicto y conservación del texto; cerrar/reabrir revisión 1 conserva el clipboard completo de 4036 caracteres. La actualización explícita de Security leyó cuatro páginas reales y creó otra revisión, conservando el dossier y pin históricos. La sede real no se movió; el E2E aislado sí cambia nombre y coordenadas para comprobar ese caso. Respuestas/ofertas sintéticas se verificaron en el entorno aislado, sin fabricar una cotización real.

[Conservación](../evidence/DP-11/local-preservation.json): cero filas previas modificadas o faltantes en 13 tablas. App local y worker siguen activos; migraciones 001–010 ya estaban aplicadas. [Handoff](../PuentesHandoff.md) e [índice](../implementation-plan.md) actualizados; se conserva la ampliación concurrente del handoff DP-10. Pruebas propias cerradas y DB de prueba detenida sin borrar datos. Pendientes: DP-12 y confirmaciones comerciales reales; ningún criterio pendiente de este ticket. Sin commit, push, despliegue ni mensajes externos.
