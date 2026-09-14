# DP-10 — Renovar la experiencia principal de investigación

Status: ready-for-agent
Execution: verified

**Fase:** E — Producto visible.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>), [DP-07](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/07-comparacion-y-recomendacion-explicable.md>), [DP-09](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/09-mapa-sf-integrado.md>).

## Objetivo

Hacer comprensible el valor desde los primeros resultados y reunir brief, oportunidades, mapa y evidencia en una misma experiencia.

## Alcance y dependencias

Diseño y estructura pueden adelantarse al cerrar DP-03; el cierre funcional depende de DP-07 y DP-09. Renovar presentación y navegación del recorrido principal, manteniendo rutas/run y adaptadores.

## Criterios de aceptación

- [x] Brief compacto editable, resultados relevantes visibles, enlace al evento en cada tarjeta y una siguiente acción concreta.
- [x] Desktop ofrece lista/mapa conectado y evidencia lateral; móvil conserva todas las acciones con alternancia o panel completo.
- [x] Progreso basado en etapas y hallazgos persistidos; resultados parciales no saltan de posición arbitrariamente ni muestran datos aún no extraídos.
- [x] Resumen de evidencia sin duplicar metadatos por campo; fechas legibles y etiquetas consistentes en inglés para la demo.
- [x] UUIDs, intentos, snapshots y logs accesibles en detalle técnico, sin desplazar las respuestas principales.
- [x] Estados de vacío, sin cobertura, proveedor caído, ubicación pendiente, contradicción y presupuesto incompleto resultan comprensibles.
- [x] Navegación por teclado, foco y etiquetas de acciones funcionales; marcadores no dependen solo del color.
- [x] Capturar y revisar a 1366×900 y ancho reducido: nombre, razón, pendiente y acciones principales visibles sin recorrer un informe técnico.

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

Inicio DP-10 (10/09/2026): leídos ticket completo, spec, plan, producto y handoff; DP-03/07/09 verified contrastados con cierres, matrices y consumidores actuales. El índice estaba desactualizado. Se conserva el árbol inicial en evidence/DP-10/preflight.json y copia privada de archivos modificables. Alcance: brief compacto, oportunidades/acciones, progreso persistido, lista/mapa y evidencia lateral, estados, inglés y teclado. Pruebas de DB/worker/E2E y builds en entorno propio; comprobación final en localhost sin reemplazar datos.


Cierre DP-10 — 10/09/2026: **verified, 8/8 criterios comprobados**. Se renovó la presentación del brief, progreso, oportunidades, comparación y evidencia, reutilizando contratos, snapshots y mapa existentes. En desktop lista/mapa quedan conectados y el expediente se abre lateralmente; móvil conserva selección/acciones y usa diálogo completo. Fechas legibles, interfaz principal en inglés y auditoría desplegable. Se corrigieron además el antecedente que podía nombrar la edición actual, la mezcla visual con hipótesis de otro brief, el popup recortado y la carga indefinida tras error de lectura.

Verificación: **339 pruebas de funciones/integración y 42 casos de navegador distintos** aprobados (47 resultados con contenedores), sin skips; build de producción con TypeScript y ESLint correctos. Revisión en Chrome sobre datos reales de localhost a **1366×900 y 390×844**: comparación AIT/Vultr, punto real de AI Security Hackathon, brief/editor, lista/mapa, cotización pendiente, falta de pertinencia, fragmento y fuente pública, teclado/foco, validación y recuperación de run inaccesible. Caídas de proveedor/servidor/WebGL y contradicción se provocaron en Chrome de producción con transporte controlado; no se atribuyen a un incidente real del proveedor. [Matriz, comandos, capturas y límites](../evidence/DP-10/README.md).

DB/worker/E2E en PostgreSQL propio **55460**, builds en directorio propio. Localhost:3000 funciona con la DB y worker existentes; migraciones 001–010 ya aplicadas, sin reseed, claves nuevas ni reinicio compartido. **Cero filas anteriores modificadas o faltantes en 13 tablas**; se conservaron archivos previos e incorporaciones concurrentes. Índice y handoff actualizados. Sin commit, push, despliegues ni mensajes externos. No quedan criterios de DP-10 pendientes; DP-11/12 y cotizaciones/permisos comerciales siguen abiertos.
