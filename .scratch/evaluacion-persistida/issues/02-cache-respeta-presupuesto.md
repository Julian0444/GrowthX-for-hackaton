# 02 — Separar búsquedas por presupuesto

Status: ready-for-human

**Estado:** autorizado por Julian el 2026-09-07 (reemplaza el aviso de «no autorizado» de los docs) e implementado; pendiente de revisión humana (ver Comments).
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [01](./01-congelar-v0-y-oraculos.md).

## Objetivo

Evitar que dos búsquedas con presupuestos diferentes compartan una respuesta o una promesa en curso de v0.

## Aristas de bloqueo

01 → 02: necesita la referencia y las costuras reproducibles de v0.

## Criterios de aceptación

- [x] Una petición de USD 2.000 seguida de otra de USD 20.000, idénticas en el resto, no recibe la respuesta generada para la primera; el `query` devuelto coincide con la petición correcta.
- [x] El mismo caso concurrente tampoco comparte la promesa pendiente entre presupuestos distintos.
- [x] Dos peticiones equivalentes sí pueden reutilizar cache y trabajo pendiente. La prueba no se limita a inspeccionar una función que serializa claves.
- [x] La normalización de presupuesto es única entre el parser y la clave; el sentinel histórico de desconocido de v0 se caracteriza y no se trata como un presupuesto positivo. La representación nueva de desconocido se define en 07.
- [x] El fallo y la degradación conservan su etiquetado. No se rellena una recomendación de un presupuesto distinto al copiar el request en el fallback.
- [x] La corrección es para el recorrido actual. El nuevo slice usará la identidad de perfil/run de PostgreSQL; este cache no se convierte en su fuente de verdad.

## Demostración

Hacer dos peticiones sucesivas y luego concurrentes al endpoint con los dos presupuestos. Un proveedor controlado permite observar qué evaluación produjo cada respuesta.

## Módulos y archivos probablemente afectados

`frontend/lib/server/pipeline/resolve.ts`, `frontend/lib/server/cache.ts`, `frontend/app/api/opportunities/search/route.ts`.
Nuevo previsto: `frontend/tests/acceptance/cache-budget.test.ts`.

## Qué test lo demuestra

`cache-budget.test.ts` contra la frontera HTTP/servicio con transporte controlado: distintos presupuestos, requests concurrentes, mismo presupuesto y fallo del proveedor. Debe fallar sobre la referencia de 01 y pasar con la corrección. No se exige que los scores necesariamente difieran: se exige que no se reutilice una evaluación incorrecta.

## Decisiones abiertas

Ninguna. Agregar presupuesto real al intake persistido corresponde a 08, para no confundir corregir el cache con completar el formulario.

## Comments

**2026-09-07 — implementación (agente).** Autorización explícita de Julian en la sesión. Sin commit ni push.

### Qué se hizo

- `frontend/lib/server/pipeline/resolve.ts`: la clave de cache (que también gobierna el mapa de promesas en curso) ahora incluye `budgetUsd` normalizado. Se exporta `normalizeBudgetUsd(value: unknown): number`, la normalización única del ticket: número finito > 0 pasa tal cual; todo lo demás cae al sentinel 0 de v0 (presupuesto desconocido). La representación nueva de desconocido queda para 07, como pide el criterio.
- `frontend/app/api/opportunities/search/route.ts`: `parseRequest` usa esa misma `normalizeBudgetUsd` en lugar de su chequeo inline, de modo que parser y clave no pueden divergir.
- `frontend/lib/server/cache.ts`: **sin cambios** — `TtlCache` es agnóstica de la clave; el defecto vivía solo en `cacheKey`. Lo dejo anotado porque el ticket lo listaba como probablemente afectado.
- Nuevo `frontend/tests/acceptance/cache-budget.test.ts` (6 casos), sobre el harness de 01 (`withReplay`, transporte grabado, reloj congelado, cache aislada):
  1. Secuencial 2.000 → 20.000 → 2.000 por la frontera de servicio: el `query` devuelto coincide con cada petición, la segunda produce su propia evaluación y la equivalente reutiliza cache (mismo `requestId`).
  2. Concurrente 2.000 ∥ 20.000: no comparten la promesa en curso.
  3. Proveedor controlado inyectado por `createSearchResolver`: etiqueta cada respuesta con el presupuesto que la produjo (se observa qué evaluación respondió, no una clave serializada); dos peticiones equivalentes concurrentes comparten un único trabajo pendiente y la misma respuesta.
  4. Fallo del proveedor (mundial y local): ambas respuestas conservan `degraded: true` y el warning del fixture, cada una con el `query` de su propio presupuesto (el fallback no copia el request ajeno), y la respuesta degradada no queda cacheada.
  5. Frontera HTTP real (`POST` del route bajo replay): 20.000 no reutiliza la evaluación de 2.000, la equivalente sí; presupuesto ausente y negativo se normalizan a 0 en el parser, comparten evaluación entre sí y no reutilizan la de un presupuesto positivo.
  6. Caracterización del sentinel: `normalizeBudgetUsd` manda `undefined`, `0`, `-50`, `NaN` e `Infinity` a 0 y deja pasar 2.000.

### Rojo sobre v0 / verde con la corrección

El test se escribió primero y se corrió contra la referencia de 01 sin tocar runtime: **6/6 en rojo** (fail 6, pass 0). Con la corrección: 6/6 en verde. Los predicados O1 de `observeOracles()` ahora observan la salida deseada; `baseline-v0.test.ts` lo registra como «corregido» en modo diagnóstico (fuentes distintas del manifiesto, el comportamiento previsto por 01 — `characterization.json` no se re-grabó).

### Tests

`pnpm --dir frontend test`: 49 tests, 49 pass, 0 fail, 0 skipped, 0 todo (43 previos + 6 nuevos). `pnpm --dir frontend lint`: sin errores (exit 0). Verificación extra `npx tsc --noEmit`: limpio.

### Desvíos y notas para revisión

- **Archivos:** solo los cuatro que nombra el ticket (uno de ellos, `cache.ts`, sin cambios). Nada fuera de esa lista.
- **Cambio de borde en el parser:** antes `budgetUsd: Infinity` pasaba como presupuesto positivo (`b.budgetUsd > 0`); con `Number.isFinite` ahora cae al sentinel 0. Es coherente con «no se trata como un presupuesto positivo» y está caracterizado en el test 6.
- **`next/server` bajo `node --test`:** el specifier no resuelve fuera de Next; el test registra un gancho local (solo en su proceso) que lo mapea a `next/server.js` para poder ejercer el `POST` real del route. No se tocó el harness de 01 (no estaba en el alcance).
- **Top-level await:** el tsconfig no lo admite en tests compilados por `next build`; el test carga los módulos v0 vía una promesa a nivel de módulo que cada caso espera.
- **Presupuesto y contenido:** como anticipa el ticket, no se exige que los scores difieran entre presupuestos; se exige (y se prueba) que ninguna respuesta provenga de la evaluación de otro presupuesto.
