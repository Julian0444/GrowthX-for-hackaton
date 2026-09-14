# DP-11 — Brief accionable, decisión y reapertura

**Execution: verified — 8/8 criterios comprobados, 10/09/2026.** Los logs conservan también los intentos intermedios; [verification-summary.json](verification-summary.json) identifica las ejecuciones finales aprobadas.

## Resultado y modelo

- El editor guarda **Explore first**, **Choose**, **Discard** y **Leave pending**, con motivos. Explorar primero usa `verdict: pending` e `intent: explore_first`: expresa intención de investigar, sin convertirla en participación acordada. Elegir conserva las condiciones abiertas; una exclusión confirmada sigue bloqueando elegir.
- Explorar/elegir permite completar objetivo, responsable, definición de éxito, modalidad propuesta o reportada como ofrecida, preguntas y partidas del comprador. Pendiente común y descartado conservan su contrato sin campaña. Los costos originales se conservan separados de los aportados; unknown, estimated, quoted, inferred y contradicted mantienen su estado. Las alternativas de precio se identifican sin sumarlas como presupuesto completo.
- Una respuesta guarda quién la aportó, soporte/referencia, autor y fecha registrados por la sesión del servidor. Ofertas y acuerdos se presentan como declaraciones del comprador. Resolver una condición no modifica el claim original ni acredita por sí solo una afirmación del organizador.
- Decisión y campaña siguen confirmándose en la transacción existente. Editar crea una revisión append-only; el conflicto 409 conserva motivos, dueño, campos y respuesta. La acción **Load latest revision · keep my draft** recupera lo guardado y permite revisar antes de guardar otra revisión.
- Los enlaces nuevos incluyen `revision=N`. La lectura devuelve la decisión y campaña de esa revisión; los enlaces anteriores sin revision continúan leyendo la última. El índice conserva el nombre del evento de su snapshot. Dossier, fuentes, relaciones y mapa reutilizan las revisiones fijadas por DP-07/09/10.
- Brief y mensaje manual incluyen evento/URL, contexto del comprador, motivos, modalidad, costos/atribución, condiciones/respuestas, próximas preguntas, fuentes y enlace exacto. Se espera el resultado real de `clipboard.writeText`; denegación o falta de acceso se comunica y conserva una vista previa copiable.

## Lecturas y dependencias contrastadas

Se leyeron completos ticket, Execution/Comments, spec y plan; se consultaron finalProduct (decisión, brief, retorno histórico, actualización y límites) y el handoff vigente. Se conservó el árbol existente: [preflight](preflight.json), copia privada y [manifiesto de cierre](verified-files.json). Durante el trabajo apareció una ampliación concurrente del handoff DP-10; se conserva bajo su corte histórico.

| Dependencia | Evidencia y código actual reutilizados |
| --- | --- |
| DP-07 verified | [Cierre](../../issues/07-comparacion-y-recomendacion-explicable.md), [matriz](../DP-07/README.md). `decisionReading`, `buildReadBundle`, revisiones del perfil/edición/organizador/participación y fuentes fijadas. `explicable-comparison.spec.ts` vuelve a verificar antecedente, edición de brief, diferencias y reapertura. |
| DP-10 verified | [Cierre](../../issues/10-experiencia-investigacion-y-evidencia.md), [matriz](../DP-10/README.md). `ComparisonPanel`, `EvaluationList`, `research-dashboard`, panel de evidencia y selección compartida de mapa. Se completa el formulario de decisión y copia, conservando navegación, foco, errores y política de ubicación. Su E2E vuelve a pasar. |

## Matriz de aceptación

| Criterio | Comprobación |
| --- | --- |
| 1. Cuatro decisiones con motivos, sin inventar oferta | Integración `decision-brief.test.ts`: intent/verdict, motivos obligatorios y condiciones heredadas. Chrome aislado recorre los cuatro radios y sus transacciones. Chrome local guarda explorar y pendiente. |
| 2. Campos esenciales y campaignDraft real | Integración: persistencia, edición, limpieza explícita de campos opcionales, costos originales y del comprador, propuesta/oferta con soporte. Chrome local: objetivo, dueño, workshop propuesto, preguntas y costo pendiente; consulta SQL del payload guardado. |
| 3. Condiciones visibles y respuesta atribuida | Integración conserva todas las condiciones del snapshot y autor de sesión. Chrome aislado resuelve una y mantiene su respuesta, atribución y soporte. Regresión de reapertura prueba dos respuestas concurrentes y recuperación tras 503 sin perder texto. |
| 4. Brief/evidencia/relaciones/coordenadas históricos | Chrome aislado cambia nombre y coordenadas mediante el writer real del catálogo: índice, dossier y pin siguen con revisión/latitud/longitud originales; bundle completo idéntico. Chrome local reimporta cuatro páginas reales: edición nueva, comparación/dossier/pin históricos intactos. |
| 5. Revisiones y conflicto entre pestañas | DB: carrera simultánea con un ganador, reintento idempotente y revisión original idéntica. Dos pestañas de Chrome local: A guarda revisión 2; B recibe conflicto, conserva texto y dueño, relee explícitamente y guarda revisión 3. |
| 6. Copia verificable | Chrome aislado compara el clipboard completo con el brief/mensaje generado; prueba denegación con clipboard anterior intacto. Chrome local lee **4036 caracteres** reales del brief original y **4042** del mensaje; cerrar/reabrir y volver a copiar conserva el brief original byte por byte. [Texto real](real-clipboard.txt), [mensaje](real-inquiry-clipboard.txt), [reapertura](real-reopened-clipboard.txt). |
| 7. Sin ejecución externa; atribución al comprador | El flujo de guardado sólo usa decisiones/campaña en PostgreSQL; copiar sólo usa Clipboard API. Regresiones registran cero llamadas prohibidas durante reapertura. Oferta sin atribución y referencias ajenas son rechazadas. No se envió mensaje, reservó actividad ni confirmó gasto. |
| 8. Actualización explícita y nueva revisión | Reimportación real iniciada con **Research organizer & projects**; run/edición nuevos sin alterar la comparación previa. E2E DP-07 y reapertura verifican **Re-evaluate with current evidence** como nuevo run/snapshot vinculado. El resumen exhaustivo de cambios de fuente sigue fuera de este ticket. |

## Pruebas automatizadas aisladas

PostgreSQL 17 propio `growthx-dp11-verification`, puerto **55461**; app/worker y `.next` en la copia de [production-path.txt](production-path.txt). El [runner](run-isolated.py) no carga `.env.local` ni claves de proveedores. Migraciones 001–010 en esa DB; las pruebas no usan ni limpian la DB local 54329.

- [Regresión de funciones/integración](regression-release.json), [log](regression-release.log): **349 aprobadas, 0 fallos, 0 skips**. Incluye 9 subcasos DP-11 y su contenedor, compatibilidad de fuentes en snapshots antiguos, concurrencia e aislamiento.
- [Build/TypeScript](build-release.json), [log](build-release.log); [ESLint](lint-release.json), [log](lint-release.log): correctos.
- Navegador de producción: DP-11, comparación DP-07, persistencia bajo caídas, reapertura, experiencia DP-10 y mapa DP-09. [Ejecución](browser-release.json), [log](browser-release.log). **29 casos distintos / 33 resultados con contenedores aprobados, 0 fallos y 0 skips**. La ejecución release incluye las últimas mejoras del formulario y el recorrido de los cuatro veredictos. El corte previo [browser-final](browser-final.json) queda como evidencia intermedia.
- [Registro específico DP-11](dp11-controlled-browser.json), [clipboard controlado](controlled-clipboard.txt), capturas `controlled-*`. `controlled-browser.json` pertenece al recorrido reutilizado DP-07, `experience-browser.json` al DP-10 y `controlled-map-assets.json` al DP-09; no confundirlos con fuentes reales.

Los intentos anteriores quedan como historial de QA. Se corrigieron selectores que cambiaron con el formulario y expectativas de enlaces sin revisión. El primer escenario geográfico controlado usaba una sede privada que la política excluye correctamente: se declaró explícitamente pública **sólo en su fixture sintética**, sin relajar la política de producción. No se contabilizan intentos repetidos como casos distintos.

Para repetir en este equipo, arrancar el contenedor propio conservado y ejecutar desde la raíz del proyecto:

```sh
docker start growthx-dp11-verification
python3 DemoPuentes/evidence/DP-11/run-isolated.py sync
python3 DemoPuentes/evidence/DP-11/run-isolated.py build-repeat pnpm build
python3 DemoPuentes/evidence/DP-11/run-isolated.py integration-repeat node --test --test-concurrency=1 --test-force-exit 'tests/**/*.test.ts'
python3 DemoPuentes/evidence/DP-11/run-isolated.py browser-repeat node --test --test-concurrency=1 --test-force-exit tests/e2e/decision-brief.spec.ts tests/e2e/reopen-evaluation.spec.ts tests/e2e/persisted-evaluation.spec.ts tests/e2e/research-experience.spec.ts tests/e2e/explicable-comparison.spec.ts tests/e2e/sf-street-map.spec.ts
```

Si la copia temporal ya no existe, `run-isolated.py prepare` crea otra y actualiza production-path. El runner utiliza Node 25 instalado; no ejecutar estas suites con las credenciales de localhost. `test:decision-brief` está agregado en package.json y exige la DB aislada.

## Chrome real y cómo probar en localhost

[Registro Chrome/CUA](real-browser.json), [filas reales](local-evidence.json), [snapshots](local-snapshots.json). No se sustituyeron respuestas de la app local. Las capturas `real-*` corresponden a localhost; se verificó el brief a **1366×900**, móvil **390×844** y el formulario móvil sin desborde.

1. Abrir la [campaña revisión 3](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0&decision=af10470d-6902-4faf-a87a-75aa511265c4&revision=3&view=campaign). Es un borrador QA de explorar AIT, con motivos y responsable recuperados del conflicto.
2. **Copiar borrador manual** o **Copy inquiry message**. Pegar el contenido y cotejarlo con **Copied text preview**. Chrome requiere que la pestaña tenga foco; en una pestaña sin foco se observó la denegación real, se informó correctamente y el clipboard no cambió. Con foco, el reintento funcionó.
3. **Volver a la comparación → Edit decision & brief**: completar/editar y guardar crea otra revisión. **Mark resolved** solicita respuesta, atribución y soporte; no resolver la cotización real con una afirmación inventada.
4. Cerrar y reabrir la [revisión original 1](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0&decision=af10470d-6902-4faf-a87a-75aa511265c4&revision=1&view=campaign): recupera motivos, dueño y brief originales, aun después de revisar la decisión.
5. [Comparación histórica AI Security](http://localhost:3000/?run=683695df-b761-432c-9839-fb2a11f6a8f8): **Inspect evidence** conserva `edition-rev-72f2a9cce09525f99c185f1e-geo`; **Explore this comparison in list & map → Map** conserva latitud `37.787215024828`, longitud `-122.394478898761`. El [run actualizado](http://localhost:3000/?run=ea8b3034-a82e-4342-a89e-e1c6d1f0f0da) tiene otra revisión. La sede real no cambió físicamente; la prueba aislada sí cambia coordenadas para verificar ese caso.

## Entorno, conservación y archivos

[Auditoría por fila](local-preservation.json): **cero filas previas modificadas o faltantes en 13 tablas**. Se agregaron dos runs, un snapshot/narrativa, cuatro revisiones de decisión (tres AIT y una pendiente Security), tres campañas, cuatro fuentes y revisiones de sus datos. Los 155 perfiles, 152 decisiones previas y 100 campañas previas siguen intactos. Backup PostgreSQL privado fuera del repositorio. No se hizo reseed ni limpieza del catálogo real.

DP-11 no necesita SQL nuevo: campos JSON opcionales, validadores y consumidores compatibles con registros anteriores. Localhost ya tenía migraciones 001–010 y app/worker activos; el modo watch cargó los cambios. [Servicios al cierre](local-services.json), [limpieza propia](cleanup.json). Sólo se detiene el contenedor de pruebas, conservando su contenido; localhost queda activo.

Cambios por módulo, detallados con hashes en [verified-files.json](verified-files.json): contratos compartidos y validador; wire/store y GET de decisión por revisión; fuentes fijadas y nombres históricos en snapshot/dashboard store; controles/campos de decisión, brief copiable, panel de campaña e índice; coordenadas de marcadores expuestas para auditoría; pruebas DP-11 y adaptación de selectores/regresiones anteriores. Los cambios DP-07/10 ya presentes no se atribuyen a esta entrega.

## Pendientes y límites

No quedan criterios abiertos de DP-11. DP-12 conserva aceptación global, ensayo y guion de demo. Siguen pendientes cotizaciones completas, acceso, audiencia y disponibilidad comercial; se muestran como preguntas y costos desconocidos. No se verificó una oferta real nueva ni se envió nada. El diff exhaustivo de fuentes y el monitoreo posterior no forman parte de DP-11. Sin commit, push, despliegue ni mensajes externos.
