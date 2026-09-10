# DP-04 — Descubrir oportunidades y fuentes con Exa

Status: ready-for-agent
Execution: pending

**Fase:** C — Investigación.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>).

## Objetivo

Conectar búsqueda web real al recorrido principal sin depender del catálogo sintético ni del antiguo ranking de mercados.

## Alcance y dependencias

Agregar un workflow/step durable para descubrir candidatos y buscar fuentes relacionadas con el brief. Reutilizar adaptadores y contratos de run, con límites y salida parcial explícita.

## Criterios de aceptación

- [ ] Generar consultas trazables a producto, audiencia, objetivo, ventana y geografía. Dos briefs distintos cambian consultas o criterios; no basta buscar siempre upcoming hackathon SF.
- [ ] Persistir candidatos y fuentes de Exa con URL, título, fecha de obtención y metadatos admitidos. Deduplicar aliases comprobados sin fusionar eventos por nombre.
- [ ] Los resultados de búsqueda son propuestas de fuentes, no evidencia suficiente de costo, ciudad, participación o éxito.
- [ ] Limitar consultas, resultados y duración por run; mantener saldo operativo y uso reportado separado del presupuesto comercial. Ningún retry vuelve a consumir sin quedar trazado.
- [ ] El resultado inicial alimenta la lectura de DP-05 y las relaciones de DP-06. No introducir un segundo catálogo desconectado del tenant.
- [ ] Exponer progreso real y recuperable; falta de key, cupo o respuesta produce parcial/error explícito, nunca los organizadores fixture como investigación encontrada.
- [ ] Comprobar al menos una consulta real al ejecutar la integración, registrar costo y hallazgos, y conservar respuesta de referencia sin credenciales.

## Demostración

Desde el brief ejecutar una búsqueda que encuentre una URL real; cerrar/reabrir el run y ver esa misma fuente lista para profundizar.

## Qué lo verifica

Transporte controlado para deduplicación, rate limit, timeout, idempotencia y reinicio; smoke real separado con consumo registrado. No hacer CI dependiente de Exa.

## Módulos y archivos orientativos

- `frontend/lib/server/discovery/exa-events.ts`
- `frontend/lib/server/evaluations/run-worker.ts`
- `frontend/lib/server/evaluations/service.ts`
- `frontend/lib/server/evaluations/`
- `frontend/lib/server/env.ts`
- `frontend/tests/connectors/`
- `frontend/tests/integration/`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No reactivar ranking mundial, búsqueda ilimitada ni Exa Agent como sustituto opaco de toda la investigación. Respetar los topes comunes de spec.md.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.
