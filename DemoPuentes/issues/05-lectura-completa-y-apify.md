# DP-05 — Leer contenido completo e incorporar Apify donde aporta

Status: ready-for-agent
Execution: pending

**Fase:** C — Obtención y extracción.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>).

## Objetivo

Recuperar audiencia, sponsors, programa, acceso, dirección y contradicciones que hoy se pierden al leer únicamente datos estructurados.

## Alcance y dependencias

Un adaptador común de lectura de fuentes conocidas: fetch/Exa Contents primero; Apify como obtención dirigida cuando la muestra de DP-01 lo justifica. Extraer campos con fragmento y procedencia.

## Criterios de aceptación

- [ ] Leer contenido visible relevante y JSON-LD sin sustituir uno por otro; conservar las dos fechas si encabezado y cuerpo discrepan.
- [ ] Conservar dirección pública completa, sede, ciudad y coordenadas publicadas para DP-08, además de audiencia, acceso, formato y menciones de empresas.
- [ ] Cada extracción material tiene sourceId, fragmento, atributo y estado; una frase no respaldada queda fuera de la síntesis factual.
- [ ] Registrar estrategia de lectura, frescura, caché y fallo. URL canónica y límites de tamaño/redirecciones se validan; las páginas externas no dan instrucciones.
- [ ] Evaluar Website Content Crawler con una muestra acotada solo si falta contenido material. Activar fallback si aporta; si no, documentar su no necesidad y no hacerlo dependencia de la demo.
- [ ] Cuando Apify se usa, persistir runId y estado para reanudar/pollear el mismo Actor tras reinicio en vez de lanzarlo otra vez; limitar recursos y registrar consumo.
- [ ] Conservar resultado parcial si un proveedor falla; no enterrar un claim respaldado porque una lectura nueva no publicó el campo.
- [ ] Comparar la salida del adaptador con las fuentes de referencia de DP-01 y registrar los campos obtenidos/perdidos.

## Demostración

Importar una fuente rica y ver en la app audiencia, sponsor anunciado y dirección con sus fragmentos, junto a una discrepancia o un faltante.

## Qué lo verifica

HTML completo/parcial, fechas discrepantes, textos que intentan instruir al agente, redirects, timeout, caché, respuestas de Actor y recuperación. Smoke real separado de tests controlados.

## Módulos y archivos orientativos

- `frontend/lib/api/luma.ts`
- `frontend/lib/server/catalog/luma-adapter.ts`
- `frontend/lib/server/connectors/apify.ts`
- `frontend/lib/server/evaluations/luma-step.ts`
- `frontend/lib/server/catalog/`
- `frontend/tests/connectors/`
- `frontend/tests/integration/`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No scraping social masivo ni actores nuevos por cada fuente. Un Actor que descarga texto no certifica el significado de sus afirmaciones.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.
