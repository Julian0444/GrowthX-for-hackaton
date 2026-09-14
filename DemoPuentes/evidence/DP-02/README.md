# Verificación DP-02 — 10 de septiembre de 2026

El ticket no tiene `Blocked by`. Se leyeron completos el ticket, `DemoPuentes/spec.md` y `implementation-plan.md`; se consultaron las secciones de comparación, presupuesto, brief, evidencia y mapa de `finalProduct.md`, CONTEXT, ADR 0001 y las reproducciones S1–S6/H1 de la auditoría.

## Cambios y demostración

| Caso | Resultado comprobado | Evidencia ejecutable |
| --- | --- | --- |
| S1: inferred/contradicted con fuentes | La campaña guarda el estado original, importe, moneda, método/base, motivo, fuentes y revisión íntegra. El parser rechaza promover esa evidencia a quoted. El control observed sí guarda quoted. | `tests/integration/trust-decision.test.ts`, `tests/ui/trust-evidence.test.ts` |
| S2: fecha citada para precio o garantía | El modelo selecciona revisiones; el resumen publicable se compone de atributo, valor y estado admitidos. Una fecha no produce precio ni garantía. Incluye controles positivos de fecha y costo inferido. | `tests/acceptance/trust-regressions.test.ts` |
| S3: partidas y monedas | USD 3000 + USD 3000 frente a USD 5000 excluye; partida pendiente, inferida o EUR mantiene condición. Dos opciones de USD 3000 no se suman; partidas de una misma opción sí. `cost_fit` también conserva los faltantes como null. | `tests/acceptance/trust-regressions.test.ts`, suite anterior de snapshots |
| S4: fecha contradicha | Exige resolver la discrepancia; el valor disputado no provoca por sí solo exclusión temporal. | `tests/acceptance/trust-regressions.test.ts` |
| S5: audiencia y acceso | Ausente/pendiente se hereda a comparación, decisión elegida o pendiente y preguntas de campaña. No se convierte en cero ni incompatibilidad. | `tests/integration/trust-decision.test.ts` |
| S6: confirmed y ubicación anunciada | Nueva revisión confirmed conserva el mismo organizador y las mismas ediciones futuras, con razones actualizadas. El mapa admite announced/confirmed con etiqueta y rechaza contradicted. | Integración anterior y `tests/ui/trust-evidence.test.ts` |
| H1: día local | Ambos caminos usan el helper de calendario que conserva el arreglo preexistente: día de SF, offsets, DST, fechas sin hora y zonas inválidas. Ambigüedades continúan pendientes. | `tests/acceptance/eligibility-window.test.ts`, regresiones nuevas |

La demostración integrada guarda, relee, reintenta y revisa cuatro alternativas: control observado, costo inferido, costo contradicho y costo pendiente. Comprueba la proyección de comparación/campaña, igualdad de lectura, idempotencia y rechazo de otro tenant. La alternativa pendiente conserva también audiencia y acceso. Los diagnósticos `e-observed`, `e-inferred`, `e-contradicted`, `e-pending` y `Fortalecer a confirmed` en `unit-integration.log` registran el resultado observable.

## Verificaciones

- Reproducción inicial: **10 fallos y 1 control positivo**, antes de modificar las reglas (`red.log`). Se tomaron los datos de la auditoría y se invirtieron las expectativas defectuosas; el reproducer inicial `.mjs` pasó a pruebas TypeScript dentro de la suite normal.
- `node --test 'tests/**/*.test.ts'`: **238/238**, cero omitidas (`unit-integration.log` y `.json`). Incluye PostgreSQL real, aislamiento de tenants, recuperación, contratos, proyecciones y los nuevos casos.
- Los tres E2E existentes: investigación SF, reapertura y recuperación con caída del worker; **11 + 9 + 5** comprobaciones. Next, Chromium, worker y PostgreSQL reales, con catálogo sintético y transportes de proveedor controlados. Logs individuales y repetición final en `e2e-final.log`.
- TypeScript sin emisión y ESLint: exit 0 (`typescript.json`, `lint.json`).
- Build de producción **Next con webpack**, exit 0 (`build.log`): copia desechable en `/tmp/growthx-dp02-build`, sin modificar `.next` del usuario. No equivale a un despliegue ni a verificar Turbopack.
- Capturas existentes en `screenshots/`. La campaña reabierta se inspeccionó a 1366×900. Los estados de costos y el texto copiable se verifican además sobre los componentes reales, no mediante snapshots de HTML esperado.

## Contrato y handoff

`ClaimRevision.costComposition` es una extensión opcional validada de v1: ausente significa partida acumulable; `alternative` requiere `groupId` y `optionId`. Las partidas de una opción se acumulan; opciones del mismo grupo no. Los importadores de paquetes deberán aportar ese dato explícito; no se infiere por palabras del nombre.

`CampaignCostItem.evidence` conserva la revisión original. `MoneyClaim` admite inferred/contradicted con base y advertencia; los payloads v1 anteriores siguen siendo legibles. Se versionan la composición narrativa (`comparison-narrative/2`) y los factores (`features/2`), sin introducir pesos ni política comercial.

`lib/evidence/claim-support.ts`, `calendar.ts` y `costs.ts` son las reglas compartidas. `locationSupport` distingue soporte documental y confirmación humana documentada; **no acredita precisión de coordenadas**. DP-08/09 deben reutilizarlo al incorporar procedencia geográfica y cartografía. Una edición futura con faltantes comerciales sigue investigable; muestra sus condiciones y no se vuelve una inversión aprobada.

DP-07 puede usar estas condiciones para comparar. DP-11 conserva su responsabilidad sobre navegación histórica y el brief completo. No se reescribieron decisiones históricas ni cotizaciones guardadas por versiones anteriores. No se agregó conversión de divisas: sin conversión explícita persiste la condición. No se investigaron proveedores reales ni se validó ROI: eso corresponde a DP-01/12.

## Aislamiento y reproducción

Estado inicial en `initial-status.txt`; se conservaron los cambios preexistentes. El PostgreSQL temporal se creó como `growthx-dp02-verification`, publicado únicamente en `127.0.0.1:55442`; no se usó la base de desarrollo del puerto 54329. Los tests crearon tenants propios. Al terminar se eliminó únicamente ese contenedor temporal con `docker rm -f growthx-dp02-verification`. Este agente no ejecutó commit, push, despliegue ni mensajes externos. Durante la verificación apareció externamente el commit `1eed2ac` («Avances de DemoPuentes y correcciones de investigación y evidencia»), que incorporó los cambios en curso y DP-01; se conservó sin alterar su historia.

Para repetir, iniciar un PostgreSQL 17 de prueba en ese puerto con usuario/base `growthx` y contraseña local de prueba `growthx`, y ejecutar desde la raíz del repositorio:

```sh
python3 DemoPuentes/evidence/DP-02/run-check.py unit-integration node --test 'tests/**/*.test.ts'
python3 DemoPuentes/evidence/DP-02/run-check.py e2e-final pnpm test:e2e
```

El runner elimina las claves de proveedores del entorno heredado, usa roles de aplicación/worker/cola sobre ese cluster aislado y registra comando, duración y exit code. Las migraciones se ejecutan desde los tests. La prueba nueva de integración no usa una conexión por defecto ni considera una omisión como evidencia de aceptación.
