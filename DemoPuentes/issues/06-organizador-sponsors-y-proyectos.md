# DP-06 — Relacionar organizadores, sponsors y proyectos con la edición correcta

Status: ready-for-agent
Execution: pending

**Fase:** C — Antecedentes útiles.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-04](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/04-discovery-exa-durable.md>), [DP-05](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/05-lectura-completa-y-apify.md>).

## Objetivo

Convertir fuentes obtenidas en antecedentes que aporten valor a la decisión, superando una lista de nombres y enlaces.

## Alcance y dependencias

Resolver identidades y persistir relaciones mínimas usando los contratos de DP-03. Buscar y leer antecedentes adicionales con los adaptadores anteriores dentro del presupuesto del run.

## Criterios de aceptación

- [ ] Distinguir organizer, coorganizer, calendar, venue y sponsor; el calendario de Luma no se asigna por defecto como organizador.
- [ ] Conservar relación empresa–edición–rol–fuente; un logo no se promociona a paid_sponsor y una repetición no demuestra ROI.
- [ ] Vincular un proyecto a su edición mediante evidencia explícita y conservar enlace público. La tecnología usada debe estar respaldada en el proyecto/material asociado.
- [ ] Nombres homónimos, años distintos, URLs sin vínculo y ubicación de la empresa no provocan fusiones de identidad.
- [ ] Explicar pertinencia respecto al producto/objetivo usando antecedentes reales; separar lo anunciado, lo reportado ocurrido y los resultados comerciales documentados.
- [ ] Contabilizar solo cobertura revisada: no extrapolar una muestra de proyectos a todos los asistentes.
- [ ] Persistir revisiones y aplicar RLS a nuevas relaciones y grants mínimos del worker; nuevas escrituras no utilizan el rol de cola.
- [ ] El dossier de al menos una opción real de DP-01 ofrece un antecedente adicional útil, con acceso a su soporte.

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
