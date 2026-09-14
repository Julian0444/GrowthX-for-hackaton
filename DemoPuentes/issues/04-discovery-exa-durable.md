# DP-04 — Descubrir oportunidades y fuentes con Exa

Status: ready-for-agent
Execution: verified

**Fase:** C — Investigación.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>).

## Objetivo

Conectar búsqueda web real al recorrido principal sin depender del catálogo sintético ni del antiguo ranking de mercados.

## Alcance y dependencias

Agregar un workflow/step durable para descubrir candidatos y buscar fuentes relacionadas con el brief. Reutilizar adaptadores y contratos de run, con límites y salida parcial explícita.

## Criterios de aceptación

- [x] Generar consultas trazables a producto, audiencia, objetivo, ventana y geografía. Dos briefs distintos cambian consultas o criterios; no basta buscar siempre upcoming hackathon SF.
- [x] Persistir candidatos y fuentes de Exa con URL, título, fecha de obtención y metadatos admitidos. Deduplicar aliases comprobados sin fusionar eventos por nombre.
- [x] Los resultados de búsqueda son propuestas de fuentes, no evidencia suficiente de costo, ciudad, participación o éxito.
- [x] Limitar consultas, resultados y duración por run; mantener saldo operativo y uso reportado separado del presupuesto comercial. Ningún retry vuelve a consumir sin quedar trazado.
- [x] El resultado inicial alimenta la lectura de DP-05 y las relaciones de DP-06. No introducir un segundo catálogo desconectado del tenant.
- [x] Exponer progreso real y recuperable; falta de key, cupo o respuesta produce parcial/error explícito, nunca los organizadores fixture como investigación encontrada.
- [x] Comprobar al menos una consulta real al ejecutar la integración, registrar costo y hallazgos, y conservar respuesta de referencia sin credenciales.

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

Preparación DP-04 (10/09/2026): leídos completos ticket, spec y plan; consultadas las secciones de producto sobre brief, discovery, progreso, fuentes, reutilización, errores y consumo. Dependencia DP-03 comprobada contra su matriz, logs y manifiesto: 245 pruebas y 26 comprobaciones E2E aprobadas en la ejecución registrada; los hashes de sus 33 archivos de código coinciden con el árbol actual. Estas pruebas no se volvieron a ejecutar en esta preparación. [Registro de dependencia y estado inicial del árbol](../evidence/DP-04/preflight.json).

Pausa solicitada por el usuario: se debe sustituir la clave anterior de Exa por la propia antes de continuar. `frontend/.env.local` existe, está ignorado por Git y contiene `EXA_API_KEY`; no se ha confirmado la titularidad de ese valor ni se ha utilizado. El usuario realizará el reemplazo local. No se guardan credenciales en la evidencia. Cero consultas Exa realizadas durante esta preparación, sin consumo provocado por este trabajo.

Estado: **blocked por configuración**, no verified. El adaptador existente `frontend/lib/server/discovery/exa-events.ts` pertenece al recorrido antiguo; falta implementar el discovery durable del recorrido principal y comprobar todos los criterios, incluido smoke real con consumo y reapertura. Solo se actualiza seguimiento y evidencia de preparación; los cambios existentes se conservan. Al confirmar el reemplazo de `EXA_API_KEY`, retomar implementación y verificaciones con la nueva configuración. Sin commit, push, despliegue ni mensajes externos.

Reanudación (10/09/2026): el usuario confirmó el reemplazo de su clave y quedó resuelta la pausa anterior. Se inició el workflow `sf-discovery/1` en la infraestructura de runs/worker existente, con fuentes propuestas separadas de afirmaciones y cuota común reservada antes de cada intento.

Cierre (10/09/2026): **verified**. El formulario principal genera consultas desde la revisión del brief y muestra páginas propuestas persistidas en el tenant. Se agregaron contratos y validación de discovery, planificador, adaptador HTTP acotado, migración `007-discovery-exa.sql`, ejecución durable y panel de resultados; se adaptaron servicio, worker, API, dashboard y regresiones históricas. El almacén común de evidencia impide convertir fragmentos de búsqueda en soporte de claims o relaciones. [Matriz de aceptación, archivos y limitaciones](../evidence/DP-04/README.md) · [manifiesto del cierre](../evidence/DP-04/verified-files.json).

Verificaciones finales: **262 pruebas de funciones/integración y 27 comprobaciones E2E aprobadas, cero fallos u omisiones**; TypeScript, ESLint y build de producción correctos. Se verificaron deduplicación sin fusionar homónimos, aislamiento entre tenants, atomicidad al aceptar/persistir, falta de key, 429, timeout, respuesta vacía/inválida, presupuesto agregado concurrente, deadline tras reinicio y recuperación tras SIGKILL. Cerrar y reabrir la pestaña conserva IDs; los jobs repetidos no repiten intentos despachados. [Logs y capturas](../evidence/DP-04/README.md#verificaciones-y-entorno).

Smoke con la clave propia: **una consulta real, cinco páginas y USD 0,007 estimados por Exa**, con reserva operativa de USD 0,02. Se conservó [respuesta admitida sin credenciales](../evidence/DP-04/real-reference-response.json), [consumo y recuperación](../evidence/DP-04/real-smoke.json) y [reapertura en navegador de producción, desktop/móvil](../evidence/DP-04/real-browser.json), sin una segunda llamada al reanudar. La migración aditiva quedó aplicada al entorno local; app y worker siguen funcionando. Las pruebas usaron PostgreSQL, Next y workers aislados.

Límites: hasta tres consultas y cinco resultados por consulta, 12 segundos por solicitud, 45 segundos persistidos por run y USD 0,06 de reserva por run dentro del cupo común de USD 10 de esta instalación. Una respuesta perdida queda con costo desconocido y reserva intacta; no se reenvía automáticamente. El costo informado no equivale a facturación definitiva ni el cupo local al saldo de la cuenta. DP-05 debe leer estas páginas y DP-06 vincularlas con ediciones/relaciones antes de afirmar costo, ciudad, participación o éxito; tampoco se generan pins desde snippets. DP-05 continúa en trabajo concurrente, conservado sin certificarlo aquí. Se preservaron cambios previos. Sin commit, push, despliegue ni mensajes externos.
