# DP-01 — Encontrar un caso real que justifique la demo

Status: ready-for-agent
Execution: verified

**Fase:** A — Verdad del caso.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: Ninguna.

## Objetivo

Fijar un comprador ilustrativo y un conjunto de fuentes actuales que permitan demostrar una decisión útil antes de construir más pantallas.

## Alcance y dependencias

Buscar un objetivo de tres oportunidades futuras en SF y antecedentes de dos organizadores. Verificar manualmente las páginas y sus relaciones. La cantidad es objetivo de cobertura, no permiso para completar huecos. Incluir un evento con coordenadas publicadas o una dirección pública que pueda resolverse.

## Criterios de aceptación

- [x] Registrar perfil, objetivo, presupuesto, ventana temporal y por qué ese ejemplo es adecuado; el comprador ilustrativo no se presenta como cliente.
- [x] Para cada opción registrar URL, fecha de consulta, fecha del evento, ciudad, organizador/rol y al menos una pregunta material; distinguir lo leído de lo inferido.
- [x] Conservar referencias a sponsors, proyectos o recaps de la edición correcta cuando existan. Identificar al menos un antecedente positivo útil y una restricción o pendiente.
- [x] Documentar un hallazgo que cambie qué investigar, qué modalidad proponer o qué condición exigir. Una contradicción de fecha por sí sola no sustituye el antecedente positivo.
- [x] Seleccionar al menos un evento con ubicación respaldada para el recorrido del mapa, sin buscar direcciones ocultas tras registro.
- [x] Producir un pequeño conjunto de referencia revisado: afirmaciones esperadas, fragmentos y cosas que no se pueden afirmar. Separar material real de fixtures.
- [x] En una primera comprobación de 60–90 minutos decidir si el caso tiene soporte. Si no, cambiar el ejemplo o registrar cobertura insuficiente; no mantener una historia sin fuentes para satisfacer la estética.

## Demostración

Abrir dos fuentes del caso y explicar una diferencia que altere la decisión del comprador. Abrir la fuente de ubicación del evento que aparecerá en el mapa.

## Qué lo verifica

Revisión manual de fuentes actuales y enlaces, con fecha y notas. No crear tests que pretendan probar vigencia futura de páginas externas.

## Módulos y archivos orientativos

- `DemoPuentes/evidence/ (nuevo material de referencia, sin secretos)`
- `docs/reviews/2026-09-10-auditoria-producto.md`
- `frontend/lib/server/catalog/manifest.ts`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No implementar discovery ni interfaz en este ticket. No afirmar compra, ROI, consentimiento de un sponsor o disponibilidad comercial que la fuente no demuestra.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Implementado y verificado el 10 de septiembre de 2026 por Codex para el alcance documental de DP-01. Blocked by: Ninguna. Ticket, spec y plan leídos completos; consultadas las secciones pertinentes del producto, auditoría y manifiesto. Los cambios existentes se conservaron; se detectó actividad concurrente en DP-02 y no se intervino allí.

**Entrega:** [caso y fuentes](../evidence/dp-01-caso-y-fuentes.md), [antecedentes](../evidence/dp-01-antecedentes.md) y [verificación con matriz de aceptación](../evidence/dp-01-verificacion.md). Comprador ilustrativo de observabilidad de agentes, USD 5.000, ventana 10/09–22/10/2026; tres opciones futuras SF. Referencia R1–R11 con fragmentos, roles por edición, inferencias, condiciones y afirmaciones que no se pueden hacer. Índice del plan y README actualizados.

**Resultado observable:** antecedentes públicos de proyectos de AI Tinkerers justifican explorar un desafío instrumentado/soporte técnico; Hackathons.team todavía no publica resultados propios y requiere condiciones diferentes. Vultr aporta historial como sponsor en París, sin atribuirle organización previa en SF. AI Security Hackathon publica dirección coincidente en dos fuentes y coordenadas en su enlace de mapa. Las otras opciones permanecen sin punto por sede oculta o ciudad sola.

**Verificación:** abiertas las tres fichas en navegador público; fuentes primarias de antecedentes y condiciones revisadas; galería y detalle de proyecto contrastados; fecha/año/zonas de Agent Arena comprobados con JSON-LD público; dirección/enlace de mapa inspeccionados. Enlaces locales, conversión temporal y diff revisados. No se sustituyó esta comprobación por build ni por tests de vigencia web. Se decidió mantener el caso en un corte anticipado dentro del bloque inicial previsto de 60–90 minutos; el tiempo real y la cobertura están registrados en la verificación, sin afirmar una hora de trabajo no transcurrida.

**Límites y siguiente paso:** los anuncios no pasan a confirmación humana/comercial; no hay cotización completa, disponibilidad de patrocinio ni ROI verificados. Algunas fuentes requieren navegador por 403 del lector. Los eventos del 12/13 de septiembre deben revisarse antes de una demo posterior. DP-03 recibe esta referencia; discovery, contratos, mapa, carga real en catálogo y aceptación integrada siguen en sus tickets. No hubo commit, push, despliegue, mensajes externos ni escritura de DB.
