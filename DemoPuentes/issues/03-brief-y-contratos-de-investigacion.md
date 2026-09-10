# DP-03 — Definir un brief operativo y contratos compartidos

Status: ready-for-agent
Execution: pending

**Fase:** B — Frontera común.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-01](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/01-caso-real-y-fuentes.md>).

## Objetivo

Hacer que producto, objetivo y restricciones definan una investigación concreta y acordar la forma de datos consumida por investigación, lista, mapa y decisión.

## Alcance y dependencias

Extender los contratos existentes con compatibilidad de registros anteriores. Definir revisión del brief, hallazgos, fuentes con fragmentos, progreso, consumo y ubicación con precisión. El contrato de mapa no obliga a tener coordenadas para que una oportunidad exista.

## Criterios de aceptación

- [ ] Entrada editable con producto, audiencia, objetivo declarado/provisional, definición de éxito opcional, presupuesto/moneda, fechas, SF, formatos, restricciones y comparables aportados.
- [ ] Persistir la revisión del brief; no forzar siempre provisional, success pending o restrictions vacías cuando el usuario sí declaró esos datos.
- [ ] Definir estados de investigación, hallazgo y evidencia con semántica de parcial/error/insuficiente; no publicar fixtures como degradación de investigación real.
- [ ] Usar una identidad y revisión de edición para lista, marcador, dossier y comparación; incluir selectedEditionId como estado de presentación compartido.
- [ ] Definir dirección pública estructurada, coordenadas, precisión (venue/address/street/city/unknown o equivalente), método y sourceIds. Migrar o decodificar registros anteriores sin asumir precisión.
- [ ] Definir relaciones de organizador, sponsor y proyecto con fuente/fragmento/edición; si se extiende un subject o contrato, actualizar parsers, DB y adaptadores juntos.
- [ ] Separar costo operativo de investigación de presupuesto comercial; especificar cupos y consumo conocido/desconocido por proveedor.
- [ ] Registrar una enmienda de dirección en el ADR/CONTEXT cuando la implementación comience: investigación web central y mapa integrado. No reabrir la infraestructura durable ni mantener reglas antiguas incompatibles en paralelo.

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
