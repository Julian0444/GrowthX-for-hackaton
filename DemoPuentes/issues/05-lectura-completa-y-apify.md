# DP-05 — Leer contenido completo e incorporar Apify donde aporta

Status: ready-for-agent
Execution: verified

**Fase:** C — Obtención y extracción.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>).

## Objetivo

Recuperar audiencia, sponsors, programa, acceso, dirección y contradicciones que hoy se pierden al leer únicamente datos estructurados.

## Alcance y dependencias

Un adaptador común de lectura de fuentes conocidas: fetch/Exa Contents primero; Apify como obtención dirigida cuando la muestra de DP-01 lo justifica. Extraer campos con fragmento y procedencia.

## Criterios de aceptación

- [x] Leer contenido visible relevante y JSON-LD sin sustituir uno por otro; conservar las dos fechas si encabezado y cuerpo discrepan.
- [x] Conservar dirección pública completa, sede, ciudad y coordenadas publicadas para DP-08, además de audiencia, acceso, formato y menciones de empresas.
- [x] Cada extracción material tiene sourceId, fragmento, atributo y estado; una frase no respaldada queda fuera de la síntesis factual.
- [x] Registrar estrategia de lectura, frescura, caché y fallo. URL canónica y límites de tamaño/redirecciones se validan; las páginas externas no dan instrucciones.
- [x] Evaluar Website Content Crawler con una muestra acotada solo si falta contenido material. Activar fallback si aporta; si no, documentar su no necesidad y no hacerlo dependencia de la demo.
- [x] Cuando Apify se usa, persistir runId y estado para reanudar/pollear el mismo Actor tras reinicio en vez de lanzarlo otra vez; limitar recursos y registrar consumo.
- [x] Conservar resultado parcial si un proveedor falla; no enterrar un claim respaldado porque una lectura nueva no publicó el campo.
- [x] Comparar la salida del adaptador con las fuentes de referencia de DP-01 y registrar los campos obtenidos/perdidos.

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

Inicio DP-05 (10/09/2026): DP-03 verified contrastado con ticket, matriz, logs y frontera técnica. Se leyeron spec, plan, producto y handoff; el código y estado actual de DP-04 prevalecen sobre instrucciones históricas. Árbol inicial en `evidence/DP-05/preflight.json`. Alcance: lectura completa, fragmentos por atributo, ubicación publicada y obtención dirigida/reanudable. Pruebas aisladas, sin editar índice compartido ni PuentesHandoff.


Cierre DP-05 (10/09/2026): **verified**. Lector común de fuentes conocidas con texto visible y JSON-LD, fragmentos por atributo, fechas discrepantes, dirección pública completa y coordenadas publicadas. Importador Luma, persistencia y dossier consumen los contratos DP-03; la UI permite desplegar la evidencia y distingue extracción automática de revisión humana. Caché durable, frescura/fallos, conservación de evidencia previa y lector de propuestas DP-04 bajo el mismo tenant/run. [Matriz de aceptación y límites](../evidence/DP-05/README.md) · [25 archivos de código/pruebas y hashes](../evidence/DP-05/verified-files.json).

Verificaciones: **279 pruebas de funciones/integración y 28 comprobaciones E2E aprobadas**, sin omisiones; TypeScript, ESLint y build de producción correctos. Se repitieron las nueve comprobaciones propias de integración tras los ajustes finales y el recorrido DP-05 sobre producción. Se comprobaron redirects, tamaño, timeout incluido cuerpo, texto no confiable, fechas discrepantes, ubicación oculta/conflictiva, replay, caché compartida entre lectura propuesta/importador, RLS y conservación de claims ante lectura escasa o fallida. Las pruebas de Actor usan respuestas controladas, con SIGKILL real del proceso tras persistir el runId y recuperación sin otro POST; cupo concurrente comprobado entre tenants.

Smoke real separado: **seis fuentes F1–F6 por HTTP** y **F2 importada mediante navegador/cola/worker de producción aislados**, mostrando audiencia, Wasmer/TENKI CLOUD, dirección con código postal, fragmentos y costo pendiente; recarga conserva IDs, desktop y móvil sin overflow horizontal. [Fuentes reales](../evidence/DP-05/real-sources.json) · [recorrido real](../evidence/DP-05/real-browser.json). No se infirió que existía un conflicto actual si no apareció en la lectura; la discrepancia de fechas se demostró con fixture identificada.

Apify: ninguna fuente de la muestra necesitó contenido adicional para este alcance, por lo que **no se ejecutó un Actor real ni se activó fallback automático**. Cero llamadas Exa Contents/Apify en DP-05. El adaptador dirigido conserva runId/estado/resultado parcial y consumo known/unknown, reserva USD 1 antes de iniciar, limita una página/un Actor por run y comparte un cupo agregado de USD 15 por instalación, sin multiplicarlo por sesión. Un costo desconocido mantiene la reserva. Exa conserva el cupo de DP-04, sin crear otro. No se atribuye una ejecución real a los tests controlados.

Integración y entorno: migración aditiva **008-source-reading.sql** aplicada únicamente al PostgreSQL propio en 55445. La DB compartida se consultó solo para leer migraciones: 001–007; su migración 008 y cualquier actualización de entorno quedan para coordinación. El importador nativo funciona sin 008 declarando caché no disponible; Apify exige persistencia. `readProposedSource` ya consume sourceIds de DP-04 y guarda fuentes completas sin sobrescribir snippets; conectar el panel/planificador a esa lectura y resolver entidades sigue en la integración con DP-04/DP-06. No se añadieron llamadas automáticas a todas las fuentes propuestas. Dirección/precisión quedan disponibles para DP-08, sin geocodificar ni sustituir su mapa.

Sin bloqueo real ni cambio incompatible de contrato. Conservados los archivos previos, sin commit, push, despliegue ni mensajes externos. Índice y PuentesHandoff no se editaron por instrucción de coordinación del usuario; se consolidarán al integrar las entregas. Evidencia propia en `DemoPuentes/evidence/DP-05/`.
