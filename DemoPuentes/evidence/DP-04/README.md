# DP-04 — Discovery durable con Exa

10 de septiembre de 2026. Implementación sobre PostgreSQL, pg-boss y el worker existentes. La clave propia fue configurada por el usuario después de la pausa inicial; no aparece en estos artefactos. [Preparación y comprobación de DP-03](preflight.json).

## Resultado observable

**Perfil → Revisar interpretación → Confirmar e investigar SF** crea un run `sf-discovery/1`. La pantalla muestra propuestas de páginas con enlace, fragmento parcial, obtención, publicación cuando está disponible y consultas que las encontraron. Cerrar la pestaña y reabrir desde Resumen conserva los mismos IDs y contenido. Un run técnico terminado puede tener cobertura parcial o insuficiente; se muestra esa distinción.

Las investigaciones `sf-organizers/1` existentes siguen reabriendo su catálogo original. El formulario principal usa discovery. Durante un nuevo run no se muestran organizadores ni eventos sintéticos del catálogo como resultados encontrados por Exa.

## Matriz de aceptación

| Criterio | Implementación y prueba |
| --- | --- |
| Consultas ligadas al brief | Plan inmutable del run con producto, audiencia, objetivo, ventana, SF, formatos, restricciones y preguntas de origen. Tres propósitos: oportunidades, antecedentes y condiciones. Dos briefs cambian consultas; cambiar presupuesto comercial no amplía cupos. Tests de conector y contratos. |
| Candidatos y fuentes persistidos | Respuestas admitidas en `discovery_operations`; candidatos por URL derivados de esas respuestas y conservados también en `runs.result`. Fuentes inmutables en el almacén común `growthx.sources`, con `catalog_loads` y tenant. Alias Luma comprobados reutilizan el normalizador existente; títulos iguales y URLs de ediciones distintas no se fusionan. |
| Búsqueda no equivale a evidencia suficiente | No se crean claims, ediciones ni organizadores a partir de snippets. `geoScope: unknown`, lectura parcial, antigüedad desconocida; publicación nunca se convierte en fecha de evento. El almacén rechaza usar `exa_search` como soporte de claims o referencias de relaciones, incluso si un consumidor antiguo entrega solo `sourceIds`. |
| Límites y consumo | Tres consultas, cinco resultados por consulta, 12 s por solicitud y 45 s de duración persistida. Una reserva conservadora de USD 0,02 por intento; hasta USD 0,06 por run. Cupo común de USD 10 en PostgreSQL, compartido por tenants y workers. Costo informado por Exa y operaciones de costo desconocido se muestran separados del presupuesto comercial. Tests concurrentes y de agotamiento. |
| Entrada a DP-05/06 | `EvaluationRunView.discovery` expone candidateId, canonicalUrl, requestedUrls, queryIds y sourceIds del tenant. Los resultados son páginas propuestas, todavía sin inventar editionId. DP-05 debe obtener contenido y asociarlo a la edición; DP-06 consume esa identidad y sus fuentes. No existe otro catálogo de eventos. |
| Progreso y fallos honestos | Estado leído de PostgreSQL durante cada intento y tras cerrar/reabrir. Sin key: cero llamadas y cobertura insuficiente. 402/429/autenticación/red/timeout/respuesta inválida: causa explícita, fuentes anteriores conservadas, sin fallback. El reintento de un job no reenvía una operación ya despachada. |
| Consulta real y reapertura | Una llamada real, cinco propuestas y USD 0,007 informados por Exa. Corte después del step, lectura desde nueva conexión y reanudación sin otra llamada. Navegador sobre build de producción: mismas fuentes después de cerrar la pestaña, desktop y móvil. |

## Smoke real y consumo

[Registro completo](real-smoke.json) · [respuesta de referencia normalizada y fuentes](real-reference-response.json) · [reapertura en navegador de producción](real-browser.json).

La consulta pidió hackathons/workshops de San Francisco entre 2026-09-10 y 2026-10-22 para desarrolladores de agentes, con objetivo de adopción de una herramienta de observabilidad. Exa propuso:

- [Build with Gemini — San Francisco](https://cloud.google.com/events/build-with-gemini-san-francisco-2).
- [Datadog Summit — Build with Agent Observability](https://events.datadoghq.com/summits/datadog-summit-san-francisco/agenda/build-with-agent-observability-from-setup-to-signal/).
- [TrueFoundry Agent Harness Hackathon](https://lu.ma/truefoundry-agent-harness-hackathon-sep19-2026).
- [The Agent Harness Workshop](https://lu.ma/agent-harness-workshop).
- [WeaveHacks 2](https://lu.ma/weavehacks2).

Estos títulos y fragmentos son propuestas de búsqueda, no eventos declarados elegibles. Por ejemplo, el fragmento de Google describe un workshop práctico, lo que orienta la siguiente lectura sobre formato, audiencia y acceso. No se verificaron aquí sus condiciones ni se produjo una recomendación de inversión.

Consumo de esta implementación: **una solicitud real, USD 0,007 informados; reserva operativa USD 0,02**. La referencia conserva únicamente campos admitidos, sin headers, credenciales ni respuestas de error crudas. `costDollars` es una estimación del proveedor; la facturación definitiva depende de sus contadores, según [Search API](https://exa.ai/docs/reference/search). La [tarifa consultada](https://exa.ai/docs/reference/pricing) publica USD 0,007 para búsqueda estándar de hasta diez resultados. La reserva no se presenta como gasto facturado ni como saldo de la cuenta.

## Durabilidad y límites de recuperación

La migración `007-discovery-exa.sql` agrega estado e intentos bajo RLS y una función restringida de reserva global. Run, plan, pasos y job se aceptan atómicamente. La reserva y la operación se confirman **antes** del envío HTTP. Fuente, respuesta admitida y consumo se confirman juntos. Cada query tiene una identidad de operación estable y única dentro del run.

Un lock de sesión por run impide dos transportes simultáneos. Usa la misma conexión para sus transacciones, sin exigir otra plaza del pool. Un SIGKILL libera el lock. Si la respuesta no alcanzó a confirmarse, el intento queda `uncertain`, su consumo desconocido y su reserva intacta. No se promete exactly-once del proveedor: Exa no ofrece aquí una clave de idempotencia. Se elige no reenviar automáticamente un intento incierto. Iniciar otra investigación es una acción explícita y crea sus propios intentos trazables.

El deadline se conserva después de un reinicio. Si ya venció, no se envían consultas pendientes. Un 429 detiene la expansión sin retries ocultos. Si Exa informa un costo mayor que la reserva, se suspende el proveedor hasta revisar el cupo. Las reservas no se devuelven automáticamente, incluso cuando el costo conocido es menor: el saldo operativo es deliberadamente conservador.

## Verificaciones y entorno

- [tests.json](tests.json) / [tests.log](tests.log): **262 aprobadas, cero fallos u omisiones**; funciones e integración, PostgreSQL real, incluyendo SIGKILL de proceso separado, corte antes/después del commit, alias, homónimos, aislamiento, cupo concurrente, timeout, falta de key, respuesta vacía/inválida y rechazo de claims derivados de búsqueda.
- [e2e.json](e2e.json) / [e2e.log](e2e.log): **27 aprobadas, cero fallos u omisiones**; suites de navegador, Next y worker separados; recorrido nuevo e históricos.
- [typecheck.json](typecheck.json), [lint.json](lint.json), [build.json](build.json): TypeScript, ESLint y build de producción.
- [real-browser.json](real-browser.json): lectura del smoke existente sobre `next start`, sin otra consulta Exa. Capturas: [desktop](screenshots/real-discovery-desktop.png), [móvil](screenshots/real-discovery-mobile.png), [reapertura](screenshots/real-discovery-reopened.png).

Contenedor propio `growthx-dp04-verification`, PostgreSQL 17 en `127.0.0.1:55444`, detenido al finalizar con los datos conservados. Base `growthx_dp04_tests` para pruebas controladas; base `growthx` para conservar el único smoke real. Las pruebas no leen `.env.local`; el runner limpia claves externas. Los E2E y builds usan copias temporales, sin modificar el servidor de la persona. El archivo temporal de sesión del navegador del smoke se eliminó al cerrar; nunca estuvo en el repo ni en la evidencia.

La migración aditiva se aplicó también a la base local configurada del usuario; no se cargaron fixtures ni se alteraron sus investigaciones/decisiones. El worker watch reinició por cambios de código y volvió a escuchar la cola; se comprobó con un experimento de credenciales ficticias que Node relee `--env-file` en ese reinicio. `localhost:3000` respondió HTTP 200. Esto último comprueba disponibilidad, no reemplaza los E2E.

Para reproducir las pruebas sin Exa, iniciar el contenedor aislado, crear `growthx_dp04_tests` y ejecutar desde el repo, secuencialmente:

```sh
python3 DemoPuentes/evidence/DP-04/run-check.py tests node --test 'tests/**/*.test.ts'
python3 DemoPuentes/evidence/DP-04/run-check.py e2e pnpm test:e2e
```

El smoke es opt-in: `frontend/scripts/smoke-exa-discovery.ts` requiere key y URLs de una base aislada preparada; ejecuta una consulta real. No forma parte de CI. La lectura de navegador `verify-exa-smoke-browser.ts` usa el run ya existente y no necesita key.

Durante la verificación se corrigieron tres supuestos del arnés: un nombre de empresa debía coincidir con la identidad sintética del fixture; los recorridos históricos debían solicitar explícitamente `sf_organizers` porque el formulario ahora envía `sf_discovery`; la limpieza de tenants debía borrar primero las nuevas tablas dependientes. Un proceso de prueba quedó abierto tras el error de limpieza y se detuvo únicamente ese proceso propio. Las verificaciones finales reemplazan esos intentos fallidos; ninguna prueba se omitió para ocultarlos.

Se detectó trabajo concurrente de DP-05 (ticket/evidencia, extracción de fuentes y dependencia `parse5` con su lockfile). Se conserva y no se atribuye a DP-04. El [manifiesto de archivos](verified-files.json) identifica el código y los consumidores comprobados por este ticket, el cotejo con el build y los cambios respecto del registro inicial; no certifica la implementación de DP-05.

## Pendientes fuera de DP-04

Lectura completa/Apify (DP-05, en curso en otro trabajo), identidad y relaciones por edición (DP-06), elegibilidad/comparación (DP-07) y geocodificación/mapa (DP-08/09) no se verifican con este ticket. Una página encontrada no genera un pin, precio, participación ni afirmación de éxito. El mapa previo sigue disponible en investigaciones históricas y en la vista explícita del catálogo.

El cupo operativo controla esta instalación PostgreSQL, no consumo realizado con la misma clave por aplicaciones externas. El saldo real de Exa y la factura no se consultan. No se reactivó el ranking mundial ni se llamó a Apify, Gemini o Exa Agent. Sin commit, push, despliegue ni mensajes externos.
