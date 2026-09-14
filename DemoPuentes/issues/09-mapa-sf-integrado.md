# DP-09 — Construir el mapa de calles de SF conectado a resultados

Status: ready-for-agent
Execution: verified

**Fase:** D — Experiencia geográfica.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-08](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/08-direccion-a-coordenadas.md>).

## Objetivo

Conservar y mejorar el mapa: un evento relevante investigado debe aparecer en una vista de SF útil y conectada con su ficha.

## Alcance y dependencias

Sustituir la cuadrícula SVG de SfEventMap por un mapa de calles; reutilizar identidades, dossiers y selección. MapLibre GL JS con estilo configurable; punto de partida propuesto OpenFreeMap. Ver notas de proveedores del plan.

## Criterios de aceptación

- [x] Calles, barrios y costa legibles, zoom, pan, controles y atribución. Verificar compatibilidad Next/worker/CSS en build de producción, no solo dev.
- [x] Proyectar el mismo conjunto filtrado de oportunidades del run; no mezclar el seed mundial ni incluir un evento porque simplemente está en el catálogo.
- [x] Evento nuevo con ubicación suficiente agrega marcador sin reiniciar el mapa. Evitar recenter continuo; acción explícita para encuadrar resultados.
- [x] Seleccionar tarjeta resalta/centra marcador; seleccionar marcador selecciona el mismo editionId y abre su ficha/dossier. Una sede con varios eventos permite distinguirlos.
- [x] Popup con nombre, fecha, venue/dirección, razón de interés, precisión/estado y enlace Abrir evento. Marcador no equivale a recomendación de inversión.
- [x] Ubicaciones anunciadas o confirmadas no desaparecen por el filtro antiguo; precisas/aproximadas/contradichas siguen la política de DP-08.
- [x] Lista conserva eventos sin ubicación y explica el conteo. Móvil alterna lista/mapa sin perder selección; teclado permite abrir eventos.
- [x] Fallo de estilo/tiles/WebGL mantiene lista útil y un error claro. Liberar instancia/listeners al desmontar y evitar duplicados al cambiar run.
- [x] En una comparación histórica usar revisión geográfica del snapshot. Datos actuales se abren expresamente como otra vista.

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


Inicio DP-09 (10/09/2026): leídos ticket completo, spec, plan, secciones de producto y handoff. DP-08 verified contrastado con README, política `projectEditionPosition`, consumidores y activación local DP-05/06/08. Estado inicial en evidence/DP-09/preflight.json; se preservan cambios existentes y el trabajo concurrente DP-07. Implementación sobre identidades/revisiones compartidas, sin geocodificación en navegador. Pruebas/build con copia y DB propias; no editar handoff ni índice durante el paralelo.

Cierre DP-09 (10/09/2026): **verified**, nueve criterios comprobados. MapLibre 6.9.0 / OpenFreeMap configurable sustituyen la cuadrícula; lista/mapa comparten filtros, selección e identidad/revisión del run; popup, agrupación de sedes, precisión DP-08, móvil, teclado, errores/reintento y snapshots históricos integrados. Se conservaron los cambios concurrentes DP-07 y sus antecedentes/razones de comparación; no hubo conflicto incompatible. Inventario, matriz y límites en [evidence/DP-09/README.md](../evidence/DP-09/README.md), hashes en [verified-files.json](../evidence/DP-09/verified-files.json).

Verificación: 334/334 de regresión, 30/30 E2E existentes, 10/10 del mapa con Chrome en producción Turbopack y otros 10/10 con webpack. Builds, TypeScript y ESLint exitosos. Smoke con HTTP/Census y vector tiles reales: AI Security → punto aproximado → mismo dossier/procedencia; The Agent Arena solo ciudad queda sin pin. Desktop 1366×900 y móvil 390×844, errores controlados de estilo/tiles y WebGL, sedes compartidas, polling sin reinicio, cambio de run y reapertura sin refrescar geografía. Ver registros y capturas en la carpeta de evidencia.

Localhost:3000 comprobado en Chrome interactivo con runs existentes, incluida comparación antigua frente a catálogo actual explícito. [Abrir caso con dirección](http://localhost:3000/?run=fda043a0-ae92-4809-b150-d0d71c62b1d8) → Eventos → Ver en mapa → Abrir dossier. Assets worker/shared activos; sin migraciones, reseed ni escrituras DP-09 en la DB local. Reactivación del contenedor existente coordinada con DP-07; datos y servicios compartidos conservados. Tests/builds únicamente en copias y PostgreSQL propios del puerto 55459.

El proveedor de cartografía requiere red y no ofrece SLA; la lista ante fallos está verificada. Cero llamadas a proveedores pagos; dos consultas gratuitas a Census en los intentos aislados, detalladas en evidencia. Sin commit, push, despliegue ni mensajes externos. Handoff e índice compartido no editados por instrucción expresa del usuario durante el paralelo. DP-10/11/12 y la aceptación global conservan su alcance pendiente; no son criterios incompletos de DP-09.
