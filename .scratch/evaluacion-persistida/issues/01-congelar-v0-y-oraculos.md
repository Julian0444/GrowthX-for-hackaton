# 01 — Congelar v0 y preparar los oráculos de aceptación

Status: ready-for-human

**Estado:** autorizado por Julian el 2026-09-07 e implementado; pendiente de revisión humana (ver Comments).
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: ninguno.

## Objetivo

Dejar una referencia reproducible del comportamiento actual y de los cinco errores que el slice debe eliminar, sin convertir esos errores en comportamiento aceptado.

## Aristas de bloqueo

No tiene bloqueos entre tickets. Es el punto de entrada del hito 1.

## Criterios de aceptación

- [x] Se registra el commit y también el estado de trabajo realmente usado: manifiesto con hashes de archivos relevantes y fixtures, versiones y reloj de evaluación. El repo contiene cambios locales; citar solo HEAD no congela esa v0. No se resetea ni se descarta trabajo existente, ni se incluyen secretos en la captura.
- [x] Los 136 eventos seed quedan identificados como conjunto histórico con fecha congelada. La prueba puede clasificar cuáles estaban vencidos en ese instante; no cambia sus fechas para hacerlos parecer vigentes.
- [x] Hay entradas/respuestas de proveedores controladas y una forma de repetir la evaluación sin red ni claves reales. Se reutiliza la frontera de búsqueda y se inyectan reloj, transporte y cache aislable donde sea necesario.
- [x] Se conserva una salida de caracterización y una matriz separada de cinco oráculos deseados: presupuesto, geografía, vigencia, soporte de citas y orden. La matriz explica cómo reproducir cada defecto; 02–06 convierten cada oráculo en prueba roja sobre v0 y verde sobre su corrección.
- [x] La captura incluye la versión de política y el significado de sus scores. Queda explícito que un score de comunidad/mercado no es un score de evento ni una política de recruiting.
- [x] Se registra el resultado de la suite existente. Fallos previos se identifican, sin solucionarlos por cambios ajenos al slice. Antes de avanzar a 07, los cinco oráculos deben estar activos y verdes; ningún skip/todo los puede sustituir.

## Demostración

Con el mismo perfil, reloj y respuestas controladas se repite la salida congelada y se muestran los cinco casos cuya salida deseada difiere. Congelar significa preservar la comparación, no mantener activa la v0 defectuosa para usuarios.

## Módulos y archivos probablemente afectados

Existentes: `frontend/tests/scoring/`, `frontend/tests/markets/global-market-search.test.ts`, `frontend/tests/graph/derive-signals.test.ts`, `frontend/lib/server/pipeline/resolve.ts`, `frontend/lib/server/demo/fixtures.ts`, `frontend/package.json`.
Nuevos previstos: `frontend/tests/fixtures/baseline-v0/` y `frontend/tests/acceptance/baseline-v0.test.ts`. Cualquier cambio de runtime se limita a abrir las costuras de prueba necesarias.

## Qué test lo demuestra

`baseline-v0.test.ts`: repetición con mismo reloj y manifiesto, respuestas de proveedor grabadas y seeds históricos sin alteración. Los tests existentes de scoring sirven como control de regresión; los tests nuevos de 02–06 comprueban corrección y no igualdad con errores de v0.

## Decisiones abiertas

Ninguna decisión comercial bloquea esta referencia. El instante exacto de congelación se documenta al implementar; no se supone que el día de la demo sea el de esta planificación.

## Comments

**2026-09-07 — implementación (agente).** Autorización explícita de Julian en la sesión; reemplaza el aviso de «no autorizado» de los docs. Sin commit ni push.

### Qué se hizo

- **Costura de runtime** (único cambio fuera de tests): `frontend/lib/server/pipeline/resolve.ts` expone `createSearchResolver(overrides)` para inyectar pipelines, fixture, auditoría y cache aislada. `searchOrFixture` sigue siendo la instancia por defecto con la misma clave de cache, fallback y auditoría; la ruta HTTP no cambia.
- **Harness** `frontend/tests/fixtures/baseline-v0/harness.ts`: alias `@/` para `node --test` (gancho `module.registerHooks`, por eso los módulos v0 se cargan con `loadV0()` dinámico), reloj congelado (`freezeClock`), transporte de repetición que sirve `providers/*.json` y falla ante URLs no grabadas, claves falsas fijadas y restauradas, utilidades de manifiesto (hashes, clasificación de seeds) y `observeOracles()`.
- **Grabaciones controladas** en `providers/` (Apify Trends, Apify X, GitHub, Exa por ciudad, Gemini). Son respuestas preparadas, no observaciones reales; están etiquetadas así en cada archivo. La de Gemini es adversarial a propósito (rank invertido, cita inexistente, cita ajena, cita irrelevante, candidato desconocido).
- **Manifiesto** `manifest.json`: HEAD `480712c` + árbol de trabajo sucio (89 rutas, documentado; nada reseteado), hashes sha256 de 20 fuentes, 9 seeds y 6 fixtures, versiones (node v22.23.2, next 16.2.6, ts 5.7.3), reloj `2026-09-07T22:28:00.000Z`, política y significado de scores, resultado de la suite previa, sin secretos. Incluye el hash de `resolve.ts` antes de la costura para trazabilidad.
- **Seeds**: 136 eventos (64 SF + 72 NYC) con hash; en el reloj congelado 63 SF y 66 NYC vencidos, 1 y 6 futuros. No se tocó ninguna fecha.
- **Caracterización** `characterization.json`: salida de v0 con modelo, sin modelo y pipeline local sobre seeds, más los 14 predicados de los oráculos con su valor v0. No se re-graba tras corregir.
- **Matriz** `oracles.md`: cinco oráculos (O1 presupuesto → 02, O2 geografía → 03, O3 vigencia → 04, O4 soporte de citas → 05, O5 orden → 06) con defecto, ubicación en código, salida v0 observada, salida deseada y receta de reproducción. Explicita que el score de comunidad/mercado no es score de evento ni política de recruiting.
- **Test** `frontend/tests/acceptance/baseline-v0.test.ts` (8 casos) y script `test:baseline` en `package.json`.

### Tests

`pnpm --dir frontend test`: 43 tests, 43 pass, 0 fail, 0 skipped, 0 todo (35 previos + 8 nuevos). `pnpm --dir frontend lint`: sin errores. Verificación extra `npx tsc --noEmit`: limpio (tsconfig incluye `tests/**`, así que `next build` los compila).

Estado de la suite **antes** del ticket: 35 pass / 0 fail, lint limpio. No había fallos preexistentes; nada ajeno al slice se tocó.

### Cómo están diseñados los oráculos en 01

`observeOracles()` corre la reproducción de cada defecto sobre el código actual y devuelve `{ v0, desired, observed }` por predicado. El test exige que lo observado sea el defecto de v0 **o** lo deseado (y, mientras los hashes coincidan con el manifiesto, exactamente el defecto). Así 01 no convierte los defectos en comportamiento aceptado ni deja tests rojos; la prueba roja sobre v0 / verde sobre la corrección la escriben 02–06 (pueden reutilizar los mismos predicados y el harness). Sobre v0 hoy: 12 predicados muestran el defecto vigente, 2 son invariantes (misma petición reutiliza cache; scores no cambian con el modelo).

### Desvíos y notas para revisión

- **Archivos no listados en el ticket:** ninguno modificado. Todo lo nuevo está dentro de `frontend/tests/fixtures/baseline-v0/` y `frontend/tests/acceptance/`. `frontend/tests/scoring/`, `global-market-search.test.ts`, `derive-signals.test.ts` y `fixtures.ts` no necesitaron cambios.
- **Alias `@/` en tests:** el gancho vive en el harness y solo funciona con import dinámico posterior. Si 02–06 prefieren imports estáticos, conviene promoverlo a un preload (`node --import`) en un archivo compartido fuera de `fixtures/` — decisión humana, no la tomé.
- **Timers de 4,5 s** (`LIVE_SIGNAL_WAIT_MS` en `global-market-search.ts`) no se pueden inyectar sin tocar ese archivo (fuera de alcance); el test tarda ~5 s por eso. Las caches por término de ese módulo son globales del proceso: `failProviders` del harness solo actúa en un proceso fresco.
- **Hallazgo de caracterización:** en v0 la ruta HTTP nunca llega al pipeline local sobre seeds (el ranking mundial siempre devuelve oportunidades y ninguna etapa lanza). El oráculo de vigencia se reproduce llamando `searchOpportunities` directo y al adaptador.
- **Reloj:** se documentó el instante real de la sesión, no el del plan ni el de la demo.
- **Manifiesto y hashes:** cualquier edición posterior de `resolve.ts` u otra fuente listada hará que el test pase a modo «fuentes distintas del manifiesto» (diagnóstico, sin exigir igualdad). Es el comportamiento buscado para 02–06; si se quiere un reloj o perfil distinto, hay que regenerar caracterización y manifiesto juntos (no hay script en repo a propósito, para que v0 no se re-grabe por accidente).
