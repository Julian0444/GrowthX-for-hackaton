# DP-02 — Corregir los defectos que pueden distorsionar una decisión

Status: ready-for-agent
Execution: in-progress

**Fase:** A — Reglas confiables.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: Ninguna.

## Objetivo

Preservar incertidumbre y restricciones en comparación y campaña, resolviendo los fallos reproducidos de la auditoría antes de añadir narrativa comercial.

## Alcance y dependencias

Corregir reglas existentes de dinero, audiencia, fecha y soporte de claims. Mantener un tratamiento coherente de estados y calendario entre investigación y comparación. La navegación histórica se integra en DP-11; no duplicar allí el arreglo de estas reglas.

## Criterios de aceptación

- [ ] Un costo inferred o contradicted con sourceIds no se guarda como quoted. Mantener su estado, base y advertencia hasta la campaña.
- [ ] Partidas acumulables conocidas de USD 3000 + USD 3000 frente a USD 5000 generan conflicto; una partida pendiente y monedas no comparables conservan condición. No sumar paquetes alternativos.
- [ ] Audiencia ausente o pendiente, acceso pendiente y costo incompleto se heredan como condiciones relevantes; no equivalen a cero ni a incompatibilidad confirmada.
- [ ] Una fecha contradicha exige resolverla. Investigación y comparación usan el día de la zona declarada y conservan fechas ambiguas.
- [ ] confirmed no pierde soporte al pasar por investigación. La política para ubicación anunciada se distingue de confirmación humana y se reutiliza en DP-08/09.
- [ ] Los resúmenes factuales se limitan a atributos y valores admitidos o composición determinística. Una cita a una fecha no puede respaldar un precio ni una garantía de contratación.
- [ ] Convertir los casos reproducidos en regresiones contra el comportamiento correcto, incluyendo control positivo. No copiar assertions que esperan el defecto.

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

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.
