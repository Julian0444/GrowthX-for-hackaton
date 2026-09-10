# DP-11 — Guardar un brief accionable y reabrir la evidencia original

Status: ready-for-agent
Execution: pending

**Fase:** E — Resultado durable.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-07](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/07-comparacion-y-recomendacion-explicable.md>), [DP-10](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/10-experiencia-investigacion-y-evidencia.md>).

## Objetivo

Entregar una decisión útil para el equipo y conservar exactamente las fuentes y condiciones que la sustentaron.

## Alcance y dependencias

Completar campos esenciales de decisión/campaña y navegación histórica. Reutilizar transacciones y revisiones actuales.

## Criterios de aceptación

- [ ] Guardar explorar primero, elegir con condiciones, descartar o pendiente con motivos según el modelo acordado; no inventar una oferta de participación.
- [ ] Permitir completar modalidad propuesta/ofrecida, objetivo, preguntas, responsable y costos aportados con su estado; no enviar siempre campaignDraft:null.
- [ ] Las condiciones heredadas de audiencia, acceso, costo y fecha permanecen visibles y resolubles con respuesta atribuida y soporte.
- [ ] Reabrir el enlace conserva brief, snapshot, fuentes, relaciones y coordenadas originales. Abrir dossier desde comparación histórica no carga silenciosamente el catálogo actual.
- [ ] Modificar motivos o resolver condiciones crea revisión con control de concurrencia; no perder texto en conflicto entre pestañas.
- [ ] Copiar brief o mensaje produce contenido verificable, incluyendo evento/enlace, contexto, condiciones y siguientes preguntas; comprobar el clipboard además del toast.
- [ ] Guardar o copiar no manda mensajes, reserva actividades ni compromete dinero. Los acuerdos declarados por el comprador se atribuyen a él.
- [ ] Actualización de datos requiere una acción y revisión nueva; un resumen completo de cambios puede quedar posterior si se mantiene esta separación.

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
