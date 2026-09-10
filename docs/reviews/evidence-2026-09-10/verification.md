# Verificación técnica independiente — GrowthX

Revisión ejecutada el 2026-09-10 UTC (2026-09-09 en Los Ángeles). Subtarea de revisión, sin implementar mejoras. Se probó el código actual del workspace, incluyendo cambios sin commit; no solo HEAD.

## Resultado

**239 pruebas en verde, 0 fallidas, 0 omitidas, 0 canceladas. ESLint, TypeScript y build de producción en verde.** El total usa el conteo TAP de Node, que incluye tests contenedores con subtests. Una pasada completa, sin repetir suites ya verdes.

| Prueba/comando ejecutado desde la copia temporal | Pass | Fail | Skip | Duración | Evidencia |
|---|---:|---:|---:|---:|---|
| `node --test "tests/**/*.test.ts"` | 214 | 0 | 0 | 14,23 s | [unit-integration.log](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/unit-integration.log) |
| `node --test tests/e2e/sf-organizer-research.spec.ts` | 11 | 0 | 0 | 37,09 s | [e2e-sf.log](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/e2e-sf.log) |
| `node --test tests/e2e/reopen-evaluation.spec.ts` | 9 | 0 | 0 | 52,45 s | [e2e-reopen.log](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/e2e-reopen.log) |
| `node --test tests/e2e/persisted-evaluation.spec.ts` | 5 | 0 | 0 | 31,16 s | [e2e-persisted.log](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/e2e-persisted.log) |
| `node node_modules/eslint/bin/eslint.js .` | Limpio | — | — | 7,20 s | [eslint.log](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/eslint.log) |
| `node node_modules/typescript/bin/tsc --noEmit` | Limpio | — | — | 3,93 s | [typescript.log](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/typescript.log) |
| `node node_modules/next/dist/bin/next build` | OK | — | — | 9,93 s | [build-local-deps.log](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/build-local-deps.log) |

Los cuatro comandos de tests son exactamente los del script `test` de package.json, ejecutados secuencialmente mediante Node. No se alteraron tests ni fixtures. El baseline v0 forma parte de los 214; registra O1–O5 como corregidos y ninguna observación INESPERADA. Los avisos de Node `MODULE_TYPELESS_PACKAGE_JSON` siguen apareciendo; no son errores de test. No se midió porcentaje de cobertura de líneas, ramas o funciones.

## Aislamiento y reproducibilidad

- Código copiado a `/tmp/growthx-review-20260910/verification-workspace`, sin `.env`, `.env.local`, otras `.env*`, `.git`, `.next` ni archivos de cache TypeScript.
- El servidor de la persona en :3000 y PostgreSQL de desarrollo en :54329 no fueron detenidos, reiniciados ni usados por estas pruebas.
- Se creó el contenedor temporal `growthx-review-20260910`, imagen local `postgres:17-alpine`, puerto **127.0.0.1:55439**, usuario y base locales `growthx`. Se eliminó al finalizar todos los tests. Los roles y bases que crean/recrean las suites vivieron solo en este cluster temporal.
- Las cuatro variables `GROWTHX_ADMIN_DATABASE_URL`, `GROWTHX_DATABASE_URL`, `GROWTHX_WORKER_DATABASE_URL`, `GROWTHX_QUEUE_DATABASE_URL` apuntaron explícitamente a :55439. No se cargaron secretos de proveedor. El runner conserva solo PATH, HOME, TMPDIR, LANG y SHELL antes de definir las variables de prueba.
- Node 22.23.2; pnpm 11.8.0 instalado; dependencias actuales del proyecto (Next 16.2.6, TypeScript 5.7.3). Los tests e2e crean sus propios Next y workers con puertos libres y Chromium headless; no controlan Chrome del usuario.
- [Runner reproducible](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/run-check.py) y [resultados estructurados](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/verification-results.json). El runner requiere volver a crear el contenedor temporal antes de repetir pruebas con DB.
- Comparación SHA-256 de 194 archivos de frontend: única diferencia de contenido en la copia, después del build, `next-env.d.ts`, generado por Next. El código/tests/configuración no se adaptaron. [Comparación](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/source-comparison.json).

Hubo dos fallos **del montaje temporal**, que no se contabilizan como defectos de la app:

1. `pnpm test` y `pnpm lint` en la copia con node_modules enlazado intentaron una instalación automática y abortaron porque no había TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Se evitó esa vía para no arriesgar dependencias compartidas y se llamaron los mismos binarios directamente. No se instaló ni actualizó ningún paquete. Logs: `full-suite.log`, `lint.log`.
2. Turbopack rechazó inicialmente un symlink de node_modules fuera de su root. Se clonó el árbol de dependencias dentro de la copia temporal usando `cp -cR`; el mismo build pasó sin cambiar configuración. Log del montaje inicial: `build.log`.

## Qué demuestra el verde

| Capacidad | Evidencia que sí se obtuvo |
|---|---|
| Persistencia real | Runs, pasos, claims, revisiones, snapshots, decisiones y campaña sobreviven a cierre de contextos y reinicio de Next. Las lecturas reabren los mismos IDs y motivos sin nuevas llamadas externas ni escrituras ocultas. |
| Recuperación de worker | SIGKILL real durante obtención y alrededor de commits; reentrega y duplicado de jobs; dos workers; el mismo run converge sin duplicar efectos ni degradar un terminal correcto. |
| Separación de tenants | Rutas y RLS impiden lectura/escritura cruzada incluso con IDs conocidos; sesión expirada y contexto reutilizado; roles de negocio/cola sin bypass. |
| Catálogo/documentación | Versiones inmutables y correcciones nuevas, identidades homónimas separadas, participaciones con empresa→edición→rol→fuente; ausencia de resultados declarada desconocida. |
| Importador Luma | El adaptador procesa HTML construido con JSON-LD y OG, conserva faltantes, valida redirecciones y límites, persiste extracción, rechaza títulos genéricos y conserva procedencia de fixture. |
| Comparación/decisión | Exclusiones factuales por fecha/lugar/presupuesto confirmado, condiciones y preguntas, decisión durable, conflicto entre dos pestañas y recuperación sin perder texto. |
| Control del modelo y de fuentes | Respuestas de modelo adversariales/preparadas no cambian la autoridad del resultado ni convierten citas inválidas en evidencia; fallo del modelo degrada de forma explícita. |
| Interfaz funcional | Los recorridos de perfil→organizador→antecedente→edición→decisión funcionan con fixtures; navegación de secciones, comparación y reapertura no mezclan paneles; listas/mapa mantienen identidades. |

## Qué NO demuestra el verde

**La suite valida la mecánica de una investigación preparada; no valida la calidad de una investigación comercial obtenida para un comprador real.**

1. **Los proveedores no se consultan en vivo.** Los e2e no prueban qué datos devuelve Luma hoy, ni una búsqueda actual con Exa/Apify, ni la salida real de Gemini. Los tests de conectores usan transportes inyectados con HTML/JSON construido. No se puede inferir cobertura, calidad ni disponibilidad actual de las fuentes.
2. **El catálogo de los e2e es sintético y deliberadamente favorable al flujo.** Se parte de `FIXTURE_CURATION_MANIFEST`; se mueven fechas de ese fixture al año siguiente para evitar caducidad en CI. Reapertura incluso añade un evento con precio de patrocinio cotizado de USD 1500 y fuentes `.example` para probar que un presupuesto de USD 500 lo excluye. Esto acredita la regla condicional, no la existencia de esa oferta ni el suministro de precios reales. [Fixture de reapertura](</Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/tests/e2e/reopen-evaluation.spec.ts:93>).
3. **No hay aceptación de relevancia por un comprador.** Las coincidencias se verifican sobre entradas y relaciones preparadas; no se mide si un DevRel/growth lead encuentra mejores eventos, ahorra tiempo, puede contactar organizadores o comprar un patrocinio adecuado.
4. **No se acredita un ranking comercial.** La suite incluye scoring con una política ficticia inyectada y también exige que, sin política aplicable, haya comparación factual sin ranking numérico. El código por defecto deja la política comercial pendiente. [Tests de política](</Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/tests/integration/evaluation-snapshot.test.ts:531>), [caso sin política](</Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/tests/integration/evaluation-snapshot.test.ts:700>).
5. **Los tests de links no verifican destinos reales.** Un caso renderiza un href de forma estática usando un registro preparado (`https://lu.ma/evento-publico`); no navega a un evento actual ni comprueba visibilidad/comprensión del enlace. Otros tests exigen que las fuentes sintéticas no generen enlaces navegables, por lo que la falta de links en el catálogo de demostración es deliberada. [evidence-links](</Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/tests/ui/evidence-links.test.ts:41>).
6. **La apariencia no tiene un oráculo de aceptación.** Hay capturas opcionales y comprobaciones DOM/texto/estado, pero no comparaciones visuales ni medidas de legibilidad, densidad, accesibilidad o facilidad para encontrar el enlace. El viewport e2e principal es 1366×900; no se valida el uso en móvil ni todos los tamaños.
7. **El alta/login de un usuario normal y la operación compartida no se demuestran.** Las suites insertan usuarios/sesiones mediante SQL y cookies de test; el entorno es local. RLS probado no equivale a haber resuelto onboarding, sesiones de un piloto ni operación alojada.
8. **La matriz de caídas acelera el tiempo de reentrega por SQL.** El proceso y SIGKILL son reales, pero la suite repone el job para no esperar los 120 s del mantenimiento normal. Acredita convergencia y durabilidad, no el tiempo de recuperación percibido en producción.
9. **No acredita resultados comerciales ni ROI.** Las pruebas aritméticas antiguas de costo por dev usan números suministrados. No validan asistencia real, adecuación del público, leads, contratación, ventas ni resultado atribuible a patrocinios.

Esto coincide con la evidencia de aceptación anterior del propio proyecto: [aceptacion-15.md](</Users/jirustaroure/Desktop/GrowthX for hackaton/.scratch/evaluacion-persistida/aceptacion-15.md>) deja sin marcar la aceptación humana con 2–5 eventos futuros reales, dos organizadores con antecedentes y una URL real de Luma verificada. **Ese pendiente no queda resuelto por esta corrida verde.**

## Observación visual concreta de los tests

La captura de organizadores, a 1366×900, muestra los primeros resultados recién cerca de y=607, después de cobertura, timestamps ISO, UUID y pasos ya completados, más dos párrafos que explican limitaciones técnicas. Las primeras tarjetas también muestran IDs y revisiones. La suite pasa con esa jerarquía porque su criterio es que la información y navegación existan, no que la respuesta sea clara y útil al verla.

[Captura organizadores](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/automated-organizers.png), [dossier](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/automated-dossier.png), [perfil](/Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/automated-profile.png). Son datos sintéticos del ensayo aislado, no capturas de la sesión real del usuario.

## Conclusión para la revisión general

Hay una base técnica comprobable de persistencia, trazabilidad, recuperación, comparación factual y decisiones condicionales. El mayor límite de la evidencia actual es que todos esos mecanismos reciben datos preparados para ejercitarlos. Un flujo puede cumplir sus tests y seguir mostrando un catálogo pobre, fuentes poco accionables y demasiada información interna. Esta verificación no propuso mejoras ni produjo un plan de implementación.
