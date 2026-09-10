# DP-12 — Cerrar la aceptación con datos reales y preparar la demo

Status: ready-for-agent
Execution: pending

**Fase:** F — Entrega demostrable.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-01](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/01-caso-real-y-fuentes.md>), [DP-02](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/02-confianza-costos-y-evidencia.md>), [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>), [DP-04](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/04-discovery-exa-durable.md>), [DP-05](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/05-lectura-completa-y-apify.md>), [DP-06](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/06-organizador-sponsors-y-proyectos.md>), [DP-07](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/07-comparacion-y-recomendacion-explicable.md>), [DP-08](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/08-direccion-a-coordenadas.md>), [DP-09](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/09-mapa-sf-integrado.md>), [DP-10](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/10-experiencia-investigacion-y-evidencia.md>), [DP-11](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/11-brief-decision-y-reapertura.md>).

## Objetivo

Demostrar el recorrido integrado y dejar una entrega reproducible, comprensible y honesta para la postulación.

## Alcance y dependencias

Integración final de discovery, extracción, relaciones, ubicación, mapa, comparación y decisión. Registrar pruebas y preparar guion/recorrido de 120 segundos.

## Criterios de aceptación

- [ ] Recorrido real brief/URL → investigación → antecedente útil → evento y marcador → comparación → decisión → reapertura; fuentes y revisiones coinciden.
- [ ] Objetivo de tres opciones y dos organizadores cuando las fuentes lo permiten; toda reducción de cobertura se declara, nunca se rellena con fixtures.
- [ ] Al menos un hallazgo adicional a título/fecha cambia la investigación o una condición. Mostrar fuente y fragmento que efectivamente lo respaldan.
- [ ] Al menos un evento investigado aparece en mapa real de SF y abre el mismo dossier. Incluir pruebas de dirección, ausencia de punto y cambio de selección.
- [ ] Completar las regresiones relevantes, lint, TypeScript y build. Ejecutar DB/worker/e2e aislados del entorno del usuario; verificar mapa con el build de producción.
- [ ] Registrar consumo total real por proveedor y costo desconocido si no está disponible; no afirmar costos cero por falta de medición.
- [ ] Preparar guion inglés ≤120 s, README alineado y pasos de reproducción. El material precargado se identifica con fecha; no simular búsqueda en vivo.
- [ ] Reservar tiempo de grabación/subida y comprobar el video que Julian aporte. Publicar o enviar la postulación es una acción separada, no ocurre por cerrar este ticket.
- [ ] Documentar limitaciones pendientes y distinguir aceptación técnica, aceptación visual y validación comercial. Una demo no acredita disposición a pagar.

## Demostración

Ensayo cronometrado del recorrido íntegro, incluyendo el mapa y un fragmento de evidencia, con recuperación desde enlace interno.

## Qué lo verifica

Matriz de spec.md, suite apropiada y smoke de proveedores reales separado. Revisar fuentes manualmente, abrir enlaces y capturar evidencia visual; no repetir suites verdes sin cambios.

## Módulos y archivos orientativos

- `DemoPuentes/evidence/`
- `DemoPuentes/acceptance.md (crear al ejecutar, con resultados reales)`
- `DemoPuentes/demo-script.md (crear al ejecutar)`
- `README.md`
- `frontend/tests/`
- `frontend/package.json`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No declarar implementado lo planificado ni éxito comercial. Si el entorno compartido no está validado, demostrar local real y documentar su reproducción.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.
