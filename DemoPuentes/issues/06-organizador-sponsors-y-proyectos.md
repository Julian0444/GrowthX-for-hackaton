# DP-06 — Relacionar organizadores, sponsors y proyectos con la edición correcta

Status: ready-for-agent
Execution: verified

**Fase:** C — Antecedentes útiles.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-04](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/04-discovery-exa-durable.md>), [DP-05](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/05-lectura-completa-y-apify.md>).

## Objetivo

Convertir fuentes obtenidas en antecedentes que aporten valor a la decisión, superando una lista de nombres y enlaces.

## Alcance y dependencias

Resolver identidades y persistir relaciones mínimas usando los contratos de DP-03. Buscar y leer antecedentes adicionales con los adaptadores anteriores dentro del presupuesto del run.

## Criterios de aceptación

- [x] Distinguir organizer, coorganizer, calendar, venue y sponsor; el calendario de Luma no se asigna por defecto como organizador.
- [x] Conservar relación empresa–edición–rol–fuente; un logo no se promociona a paid_sponsor y una repetición no demuestra ROI.
- [x] Vincular un proyecto a su edición mediante evidencia explícita y conservar enlace público. La tecnología usada debe estar respaldada en el proyecto/material asociado.
- [x] Nombres homónimos, años distintos, URLs sin vínculo y ubicación de la empresa no provocan fusiones de identidad.
- [x] Explicar pertinencia respecto al producto/objetivo usando antecedentes reales; separar lo anunciado, lo reportado ocurrido y los resultados comerciales documentados.
- [x] Contabilizar solo cobertura revisada: no extrapolar una muestra de proyectos a todos los asistentes.
- [x] Persistir revisiones y aplicar RLS a nuevas relaciones y grants mínimos del worker; nuevas escrituras no utilizan el rol de cola.
- [x] El dossier de al menos una opción real de DP-01 ofrece un antecedente adicional útil, con acceso a su soporte.

## Demostración

Evento → organizador → edición anterior → empresa o proyecto → fragmento de fuente, explicando por qué importa al comprador.

## Qué lo verifica

Homónimos, edición equivocada, calendario/host, logo/paid sponsor, repo sin vínculo, muestra parcial, contradicción y tenant ajeno. Verificación manual del caso real.

## Módulos y archivos orientativos

- `frontend/lib/server/catalog/store.ts`
- `frontend/lib/server/catalog/read.ts`
- `frontend/lib/server/catalog/research.ts`
- `frontend/lib/server/evaluations/research.ts`
- `frontend/db/migrations/`
- `frontend/components/research-dashboard/research-dossier.tsx`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No puntuación de reputación ni inferencias sobre compradores, asistentes o éxito no documentados. No construir un CRM de empresas.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.

Referencia aclarada por revisión de DP-01 (10/09/2026): usar [fichas de organizadores](../evidence/dp-01-organizadores.md) y R12–R15 del [caso](../evidence/dp-01-caso-y-fuentes.md). El dossier debe responder quién organiza, qué experiencia como organizador tiene, qué audiencia está anunciada/comprobada y qué falta; no sustituir ese expediente por una lista de sponsors. La cobertura es dos organizadores actuales con antecedentes, uno con historial en el rol de organizador. París es antecedente válido de patrocinio, fuera del mapa de oportunidades SF. El [registro por afirmación](../evidence/dp-01-afirmaciones.md) separa premio, tecnología declarada y eficacia no comprobada. Esta nota no ejecuta DP-06.

Inicio DP-06 (10/09/2026): leídos completos ticket, spec y plan; consultados producto, handoff, organizadores y afirmaciones R12–R15 de DP-01. DP-04/05 verificados contra tickets, evidencia, contratos DP-03 y frontera readProposedSource. Estado previo y hashes en [preflight](../evidence/DP-06/preflight.json). Entorno propio previsto: PostgreSQL 55446, worker/Next/build aislados. Se preservan cambios existentes y trabajo concurrente DP-08; no se editan índice ni handoff.

Cierre DP-06 (10/09/2026): implementado el workflow durable `background-research/1`, reutilizando discovery y lectura completa DP-05; snippets quedan separados e inmutables. Identidades conservadoras, historial por edición/año, roles de organizador/host/calendario/empresa/proyecto, claims y fragmentos, pertinencia para el brief y próximos pasos pendientes. Dossier navegable desde Eventos o una propuesta: evento → organizador → edición anterior → empresa/proyecto → soporte. Migración 009 agrega solo INSERT de identidades/revisiones al worker.

Verificado: 309 tests de regresión (incluyen 11 de extracción DP-06 y 10 subcasos de integración), 29 tests E2E de recorridos existentes y nuevo flujo, build de producción aislado, TypeScript y lint. Se probaron homónimos, otro año/edición, calendario/host, logo/pago, repo sin vínculo, premio frente a tecnología, cobertura parcial, contradicción, RLS/tenant ajeno, rollback, replay, recuperación al vencer el plazo y continuidad de claims de una importación Luma. Evidencia y resultados finales: [DP-06/README](../evidence/DP-06/README.md) y [archivos verificados](../evidence/DP-06/verified-files.json).

Caso real: Chromium visible con fuentes HTTP de AIT y Vultr, y reapertura desde el build final sin nueva obtención. AIT actual → antecedente organizando Secure Agents Buildathon → Google Cloud anunciado y programa técnico con fragmentos; Vultr host actual → patrocinio reportado en París, organizado por lablab.ai. El run final de AIT tuvo 4 respuestas 403 (galería, proyectos y directorio): no se inventaron proyectos ni contacto. Una descarga real previa de Citadel conserva soporte de vínculo, premio y tecnología por separado; el recorrido completo con proyectos se verificó además con transporte controlado identificado. No se confunde esa prueba con disponibilidad pública posterior, asistentes ni resultados comerciales.

Integración: se usaron DB 55446, worker, puertos y build propios; migraciones 009 y 010 concurrente aplicadas solo allí. Se preservaron los cambios compatibles de DP-08 en contratos/store/read/worker/dossier; su test de integración exige su propia DB y quedó explícitamente fuera de la regresión de esta sesión. Queda aplicar migraciones pendientes y reiniciar servicios al integrar los cambios combinados; localhost:3000 y DB 54329 no se tocaron. Por instrucción del usuario no se editan índice ni handoff. Sin commit, push, despliegue ni mensajes externos.
