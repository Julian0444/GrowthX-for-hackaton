# DP-10 — Renovar la experiencia principal de investigación

Status: ready-for-agent
Execution: pending

**Fase:** E — Producto visible.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>), [DP-07](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/07-comparacion-y-recomendacion-explicable.md>), [DP-09](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/09-mapa-sf-integrado.md>).

## Objetivo

Hacer comprensible el valor desde los primeros resultados y reunir brief, oportunidades, mapa y evidencia en una misma experiencia.

## Alcance y dependencias

Diseño y estructura pueden adelantarse al cerrar DP-03; el cierre funcional depende de DP-07 y DP-09. Renovar presentación y navegación del recorrido principal, manteniendo rutas/run y adaptadores.

## Criterios de aceptación

- [ ] Brief compacto editable, resultados relevantes visibles, enlace al evento en cada tarjeta y una siguiente acción concreta.
- [ ] Desktop ofrece lista/mapa conectado y evidencia lateral; móvil conserva todas las acciones con alternancia o panel completo.
- [ ] Progreso basado en etapas y hallazgos persistidos; resultados parciales no saltan de posición arbitrariamente ni muestran datos aún no extraídos.
- [ ] Resumen de evidencia sin duplicar metadatos por campo; fechas legibles y etiquetas consistentes en inglés para la demo.
- [ ] UUIDs, intentos, snapshots y logs accesibles en detalle técnico, sin desplazar las respuestas principales.
- [ ] Estados de vacío, sin cobertura, proveedor caído, ubicación pendiente, contradicción y presupuesto incompleto resultan comprensibles.
- [ ] Navegación por teclado, foco y etiquetas de acciones funcionales; marcadores no dependen solo del color.
- [ ] Capturar y revisar a 1366×900 y ancho reducido: nombre, razón, pendiente y acciones principales visibles sin recorrer un informe técnico.

## Demostración

Una persona abre una investigación terminada y explica qué opción exploraría y qué falta confirmar, usando lista o mapa y abriendo una fuente.

## Qué lo verifica

Pruebas de interacción que aseguren selección, navegación y estados de error; revisión visual en Chrome con datos reales. No convertir diferencias decorativas en tests que espejen CSS.

## Módulos y archivos orientativos

- `frontend/components/research-dashboard/research-dashboard.tsx`
- `frontend/components/research-dashboard/research-dossier.tsx`
- `frontend/components/research-dashboard/comparison-panel.tsx`
- `frontend/components/atlas/evidence-links.tsx`
- `frontend/app/globals.css`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No rebranding completo ni reconstrucción del sitio público. Una UI con fixtures sirve para desarrollo; la aceptación final usa el caso real.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.
