# DP-09 — Construir el mapa de calles de SF conectado a resultados

Status: ready-for-agent
Execution: pending

**Fase:** D — Experiencia geográfica.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-08](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/08-direccion-a-coordenadas.md>).

## Objetivo

Conservar y mejorar el mapa: un evento relevante investigado debe aparecer en una vista de SF útil y conectada con su ficha.

## Alcance y dependencias

Sustituir la cuadrícula SVG de SfEventMap por un mapa de calles; reutilizar identidades, dossiers y selección. MapLibre GL JS con estilo configurable; punto de partida propuesto OpenFreeMap. Ver notas de proveedores del plan.

## Criterios de aceptación

- [ ] Calles, barrios y costa legibles, zoom, pan, controles y atribución. Verificar compatibilidad Next/worker/CSS en build de producción, no solo dev.
- [ ] Proyectar el mismo conjunto filtrado de oportunidades del run; no mezclar el seed mundial ni incluir un evento porque simplemente está en el catálogo.
- [ ] Evento nuevo con ubicación suficiente agrega marcador sin reiniciar el mapa. Evitar recenter continuo; acción explícita para encuadrar resultados.
- [ ] Seleccionar tarjeta resalta/centra marcador; seleccionar marcador selecciona el mismo editionId y abre su ficha/dossier. Una sede con varios eventos permite distinguirlos.
- [ ] Popup con nombre, fecha, venue/dirección, razón de interés, precisión/estado y enlace Abrir evento. Marcador no equivale a recomendación de inversión.
- [ ] Ubicaciones anunciadas o confirmadas no desaparecen por el filtro antiguo; precisas/aproximadas/contradichas siguen la política de DP-08.
- [ ] Lista conserva eventos sin ubicación y explica el conteo. Móvil alterna lista/mapa sin perder selección; teclado permite abrir eventos.
- [ ] Fallo de estilo/tiles/WebGL mantiene lista útil y un error claro. Liberar instancia/listeners al desmontar y evitar duplicados al cambiar run.
- [ ] En una comparación histórica usar revisión geográfica del snapshot. Datos actuales se abren expresamente como otra vista.

## Demostración

Investigar evento → aparece pin → seleccionar tarjeta → marcador destacado → abrir desde mapa → ver fuente y comparar. Mostrar un resultado sin punto sin perderlo.

## Qué lo verifica

Componente/adaptador para identidades y estados; Chrome real a 1366×900 y ancho móvil, mismo venue, cero puntos, cambio de run y fallo de red. Smoke con mapa real y atribución; CI de interacción con assets/proveedores controlados.

## Módulos y archivos orientativos

- `frontend/components/research-dashboard/sf-event-map.tsx`
- `frontend/components/research-dashboard/research-dashboard.tsx`
- `frontend/components/research-dashboard/research-model.ts`
- `frontend/app/globals.css`
- `frontend/package.json`
- `frontend/components/atlas/world-map.tsx (referencia visual, sin borrarlo por esta tarea)`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

Sin globo nuevo, capas de popularidad ni mapas que deduzcan venues. No eliminar el mapa antiguo de caracterización para implementar esta vista.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.
