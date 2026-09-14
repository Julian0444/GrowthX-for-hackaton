# DP-07 — Comparar opciones y explicar qué investigar primero

Status: ready-for-agent
Execution: verified

**Fase:** D — Decisión.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-02](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/02-confianza-costos-y-evidencia.md>), [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>), [DP-06](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/06-organizador-sponsors-y-proyectos.md>).

## Objetivo

Producir una lectura de decisión ligada al comprador que use antecedentes y restricciones sin inventar ranking comercial.

## Alcance y dependencias

Comparar hasta tres ediciones bajo el mismo brief. Separar posibilidad de participar, pertinencia, calidad de evidencia y propuesta de actividad.

## Criterios de aceptación

- [x] Cada alternativa muestra razón concreta, antecedente, modalidad publicada o propuesta, costo/pendientes y siguiente pregunta.
- [x] La elegibilidad usa las reglas corregidas de DP-02 antes de priorizar; las condiciones materiales llegan al resultado.
- [x] Prioridad de investigación explícita por criterios versionados o diferencias factuales; si no hay base para ordenar, mantener comparación sin orden de inversión.
- [x] Un modelo redacta únicamente sobre evidencia admitida y propuestas etiquetadas; no agrega cifras de éxito o precio a partir de otras clases de datos.
- [x] Cambiar brief/restricciones produce otra evaluación y una explicación de diferencias; no mutar el snapshot original.
- [x] Una opción con ciudad pendiente puede seguir como dossier y candidata condicional conforme a sus restricciones; no inventar punto ni considerar confirmado SF.
- [x] Si ninguna opción tiene soporte suficiente, decirlo con una pregunta útil en vez de forzar tres recomendaciones.
- [x] Guardar snapshot con revisiones exactas de ediciones, relaciones y fuentes que sustenten la lectura.

## Demostración

Comparar dos opciones reales y mostrar un antecedente que favorezca investigar una y una condición que impida comprometer presupuesto.

## Qué lo verifica

Contrastes de brief, opciones incompletas, contradicciones, orden estable cuando aplica, citas inválidas, modelo no disponible y snapshots inmutables.

## Módulos y archivos orientativos

- `frontend/lib/server/evaluations/compare.ts`
- `frontend/lib/server/evaluations/model-adapter.ts`
- `frontend/lib/server/evaluations/snapshot-store.ts`
- `frontend/lib/server/evaluations/scoring-policy.ts`
- `frontend/lib/api/opportunity-adapter.ts`
- `frontend/components/research-dashboard/comparison-panel.tsx`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No score de ROI, retorno esperado ni optimizador multicanal. No mezclar hipótesis del comprador con evidencia histórica.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.

Inicio DP-07 (10/09/2026): leídos ticket completo, spec, plan, producto y handoff; DP-02/03/06 verified contrastados con sus matrices y código. El índice tiene estados históricos. Se conserva el árbol previo en [preflight](../evidence/DP-07/preflight.json). Alcance: lectura ligada al brief, antecedentes fijados, prioridad de investigación explicada, diferencias entre evaluaciones y UI/validadores compartidos. Pruebas y build aislados; integración posterior en localhost conservando datos. No se edita handoff ni índice durante DP-09.


Entrega DP-07 verificada (10/09/2026): lectura persistida `research-comparison/1` ligada al brief con antecedentes citables, roles por edición, modalidad publicada/propuesta, costo/condiciones y pregunta. Elegibilidad DP-02 antes de prioridad; sin ranking de inversión. El editor crea otra revisión de perfil y snapshot vinculado con diferencias legibles. Se fijan ediciones históricas, relaciones, claims y fuentes; dossiers/organizadores de la comparación se abren desde el bundle guardado. Contratos aditivos y snapshots anteriores compatibles, sin nueva migración SQL.

Comprobaciones: 334/334 pruebas de regresión, 12/12 checks finales focalizados y 30/30 E2E en los cortes finales; build, TypeScript y lint aislados aprobados, lint sin advertencias. Los dos fallos anteriores del harness WebGL se resolvieron coordinadamente con DP-09 usando Chrome y estilo controlado; se conservaron los logs del fallo y del éxito. Se verificaron citas inválidas/ajenas, cifras inventadas, caída de modelo, RLS, idempotencia, costos aditivos/mixtos/incompletos, restricciones libres, ciudad pendiente sin pin, diferencias y reapertura inmutable. [Matriz, archivos, resultados y límites](../evidence/DP-07/README.md).

Demostración en localhost: AIT actual frente a Agent Arena/Vultr con fuentes reales ya admitidas. Secure Agents Buildathon y su programa técnico favorecen investigar AIT; Vultr conserva sponsor reportado en París. Las cotizaciones de patrocinio siguen desconocidas. Cambiar a pagos/contratación elimina el soporte pertinente; mover la ventana excluye AIT por fecha. Se reabrió el snapshot anterior sin modificación y se dejó el contenido original del brief activo como nueva revisión v5. [Comparación final](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0), [exportación](../evidence/DP-07/local-real.json), [captura de antecedente](../evidence/DP-07/screenshots/local-antecedent.png).

Activación local coordinada: arranque del contenedor PostgreSQL existente; sin reset, nuevas migraciones ni reemplazar app/worker. Backup privado fuera del repo. Auditoría de 13 tablas: cero filas previas modificadas/faltantes; decisiones, campañas, fuentes y revisiones conservadas. Se agregaron seis comparaciones y cuatro revisiones de perfil, manteniendo todas las anteriores. Pruebas/build en copia y DB propios (55447); app local permanece en 3000. El modelo local continúa en fallback por clave ausente; el transporte del modelo se verificó de forma controlada, sin afirmar una llamada real a Gemini.

Se preservaron cambios previos y contratos compartidos con DP-09; no se editaron handoff ni índice por instrucción del usuario. Pendiente fuera del cierre DP-07: cotizaciones/permisos comerciales reales, activación opcional de Gemini y actualización documental conjunta al finalizar el paralelo. No se hicieron commit, push, despliegues ni mensajes externos.
