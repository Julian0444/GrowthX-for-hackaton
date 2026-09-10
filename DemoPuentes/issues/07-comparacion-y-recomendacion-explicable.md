# DP-07 — Comparar opciones y explicar qué investigar primero

Status: ready-for-agent
Execution: pending

**Fase:** D — Decisión.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-02](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/02-confianza-costos-y-evidencia.md>), [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>), [DP-06](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/06-organizador-sponsors-y-proyectos.md>).

## Objetivo

Producir una lectura de decisión ligada al comprador que use antecedentes y restricciones sin inventar ranking comercial.

## Alcance y dependencias

Comparar hasta tres ediciones bajo el mismo brief. Separar posibilidad de participar, pertinencia, calidad de evidencia y propuesta de actividad.

## Criterios de aceptación

- [ ] Cada alternativa muestra razón concreta, antecedente, modalidad publicada o propuesta, costo/pendientes y siguiente pregunta.
- [ ] La elegibilidad usa las reglas corregidas de DP-02 antes de priorizar; las condiciones materiales llegan al resultado.
- [ ] Prioridad de investigación explícita por criterios versionados o diferencias factuales; si no hay base para ordenar, mantener comparación sin orden de inversión.
- [ ] Un modelo redacta únicamente sobre evidencia admitida y propuestas etiquetadas; no agrega cifras de éxito o precio a partir de otras clases de datos.
- [ ] Cambiar brief/restricciones produce otra evaluación y una explicación de diferencias; no mutar el snapshot original.
- [ ] Una opción con ciudad pendiente puede seguir como dossier y candidata condicional conforme a sus restricciones; no inventar punto ni considerar confirmado SF.
- [ ] Si ninguna opción tiene soporte suficiente, decirlo con una pregunta útil en vez de forzar tres recomendaciones.
- [ ] Guardar snapshot con revisiones exactas de ediciones, relaciones y fuentes que sustenten la lectura.

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
