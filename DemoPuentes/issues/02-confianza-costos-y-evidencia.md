# DP-02 — Corregir los defectos que pueden distorsionar una decisión

Status: ready-for-agent
Execution: verified

**Fase:** A — Reglas confiables.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: Ninguna.

## Objetivo

Preservar incertidumbre y restricciones en comparación y campaña, resolviendo los fallos reproducidos de la auditoría antes de añadir narrativa comercial.

## Alcance y dependencias

Corregir reglas existentes de dinero, audiencia, fecha y soporte de claims. Mantener un tratamiento coherente de estados y calendario entre investigación y comparación. La navegación histórica se integra en DP-11; no duplicar allí el arreglo de estas reglas.

## Criterios de aceptación

- [x] Un costo inferred o contradicted con sourceIds no se guarda como quoted. Mantener su estado, base y advertencia hasta la campaña.
- [x] Partidas acumulables conocidas de USD 3000 + USD 3000 frente a USD 5000 generan conflicto; una partida pendiente y monedas no comparables conservan condición. No sumar paquetes alternativos.
- [x] Audiencia ausente o pendiente, acceso pendiente y costo incompleto se heredan como condiciones relevantes; no equivalen a cero ni a incompatibilidad confirmada.
- [x] Una fecha contradicha exige resolverla. Investigación y comparación usan el día de la zona declarada y conservan fechas ambiguas.
- [x] confirmed no pierde soporte al pasar por investigación. La política para ubicación anunciada se distingue de confirmación humana y se reutiliza en DP-08/09.
- [x] Los resúmenes factuales se limitan a atributos y valores admitidos o composición determinística. Una cita a una fecha no puede respaldar un precio ni una garantía de contratación.
- [x] Convertir los casos reproducidos en regresiones contra el comportamiento correcto, incluyendo control positivo. No copiar assertions que esperan el defecto.

## Demostración

Mostrar un costo incompleto como pendiente en comparación y campaña; mostrar que fortalecer un claim no hace desaparecer el evento.

## Qué lo verifica

Casos de la auditoría S1–S6 y H1: monedas, partidas, audiencia, fecha contradicha, zona horaria, confirmed y narrativa adversarial. Pruebas de funciones y una integración de guardado con DB aislada; conservar la suite anterior.

## Módulos y archivos orientativos

- `frontend/lib/server/evaluations/eligibility.ts`
- `frontend/lib/server/evaluations/research.ts`
- `frontend/lib/server/evaluations/model-adapter.ts`
- `frontend/lib/server/decisions/store.ts`
- `frontend/lib/api/opportunity-adapter.ts`
- `frontend/tests/`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

No introducir score de inversión, nuevos pesos comerciales ni una aprobación humana para cada extracción. Este ticket corrige semántica, no rediseña toda la UI.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Verificado el 10 de septiembre de 2026. Sin dependencias bloqueantes. Se conservaron los cambios existentes, incluido el cálculo del día local de comparación, que ahora comparte investigación.

Implementación: reglas compartidas en `frontend/lib/evidence/{calendar,claim-support,costs}.ts`; consumidores en `evaluations/{eligibility,research,scoring-policy,model-adapter}.ts`, `decisions/store.ts`, contratos/parsers, `opportunity-adapter.ts`, `sf-event-map.tsx` y el texto de `campaign-panel.tsx`. Se agregaron regresiones en `tests/acceptance/trust-regressions.test.ts`, `tests/integration/trust-decision.test.ts`, `tests/ui/trust-evidence.test.ts` y su fixture. Los controles positivos de las suites anteriores de decisión/snapshot incorporan soporte explícito de fecha; se conservan sus verificaciones.

Resultado observable: inferencias y contradicciones conservan estado, base, advertencia, fuentes y revisión al guardar/releer/revisar campaña; el parser también impide promoverlas a cotización. USD 3000 + USD 3000 excluye frente a USD 5000; paquetes alternativos no se suman. Faltantes y monedas incomparables conservan condiciones, incluso al guardar una decisión pendiente. Una edición futura con faltantes comerciales sigue investigable. Confirmed conserva matches y soporte de ubicación; anunciado no se confunde con confirmación humana. El modelo solo selecciona claims: los resúmenes publicables se componen determinísticamente con atributo, valor y estado.

Verificación ejecutada: reproducción inicial **10 fallos + 1 control correcto**; suite final **238/238** funciones/integración, **25/25** comprobaciones en los tres E2E existentes, **cero omitidas**. Guardado y lectura usan PostgreSQL real aislado en 55442, incluyendo tenant señuelo, idempotencia, revisiones y fortalecimiento real de claims. TypeScript, ESLint y build de producción con webpack: exit 0. [Matriz, logs, capturas, comandos y handoff](../evidence/DP-02/README.md).

Límites: estas pruebas usan catálogo/transportes controlados, no son validación comercial ni smoke de proveedores reales. No hay conversión de monedas ni geocodificación nueva. DP-08/09 deben reutilizar la política de soporte y agregar procedencia/precisión; DP-11 mantiene navegación histórica y brief completo. Los payloads v1 anteriores siguen legibles y no se reescriben decisiones históricas. Los paquetes requieren metadatos explícitos de grupo/opción. No quedan criterios pendientes dentro de DP-02.

Este agente no ejecutó commit, push, despliegues ni mensajes externos. Durante la verificación apareció externamente `1eed2ac`, que incorporó trabajo en curso y DP-01; se conservó sin modificar su historia.
