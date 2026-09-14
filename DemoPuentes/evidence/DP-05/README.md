# DP-05 — Lectura completa, extracción y Apify dirigido

Verificado el 10 de septiembre de 2026. Esta entrega lee las fuentes públicas conocidas, conserva fragmentos por atributo y alimenta el dossier persistido de Luma. No convierte menciones en relaciones comerciales confirmadas. [Ticket](../../issues/05-lectura-completa-y-apify.md).

## Dependencia, coordinación y estado previo

Se leyeron completos ticket (Execution y Comments), spec, plan y handoff, y se consultaron las secciones pertinentes del producto. DP-03 estaba `verified`: se contrastaron su matriz, contratos y frontera con los logs de **245 pruebas y 26 comprobaciones E2E**. Esas cifras son evidencia de la entrega previa, no pruebas ejecutadas por DP-05. Las regresiones propias posteriores se detallan abajo.

[preflight.json](preflight.json) conserva HEAD, estado inicial y hashes; había numerosos cambios previos. La implementación respeta los contratos de DP-03 (`SourceRecord`, `ClaimRevision.evidence`, `publicLocation`, `ProviderConsumption`) sin cambiar su versión. El cierre concurrente de DP-04 aporta discovery y fuentes persistidas; las instrucciones históricas del handoff sobre proveedores apagados no se aplicaron como alcance nuevo. No se editaron PuentesHandoff, el índice ni el plan compartido desde esta sesión. Sus modificaciones por otras entregas no se atribuyen a DP-05.

## Matriz de aceptación

| Criterio | Resultado comprobado | Evidencia |
| --- | --- | --- |
| Visible + JSON-LD | DOM parseado sin ejecutar JS; audiencia, sponsors, programa, acceso y fechas del cuerpo complementan los datos estructurados. La fixture conserva 20/04 y 21/04/2027 como contradicción, con ambos fragmentos. Una fecha UTC y su día Pacific compatible no producen falso conflicto. | `source-reading.test.ts` de conectores; dossier de [producción controlada](e2e-production.log). |
| Ubicación pública | Dirección completa, sede, ciudad y coordenadas publicadas, con método/proveedor/límite. F2 incluye 501 Folsom St, CA 94105, USA y su enlace de mapa. Sin coordenadas conserva dirección para DP-08; con sede sin ciudad conserva alcance venue. Ubicación oculta/conflictiva no produce punto exacto. | [real-sources.json](real-sources.json), integración, capturas de dirección. |
| Soporte por atributo | Claims automáticos `announced`/`reported`/`contradicted`, reviewer null, sourceId + fragmentId resolubles bajo tenant. Logos, snippets de búsqueda y frases de instrucciones no se convierten en afirmaciones. | Conectores e integración; cada claim material del dossier se resuelve contra sus fragmentos. |
| Lectura y límites | URL canónica validada, HTTPS y hosts conocidos, sin credenciales/query; redirecciones manuales validadas antes de seguir, 3 máximo; cuerpo 2 MB; deadline común de hasta 20 s (10 s por defecto), incluidos cuerpo y redirecciones. Caché, frescura, estrategia y fallo persistidos. | Conectores: aliases, redirects, tamaño, tipo, timeout de transporte/cuerpo y replay inválido. Integración de caché/RLS. |
| Evaluación de Apify | Las seis páginas de la muestra entregaron por HTTP el material relevante; no se justificó ejecutar un Actor real. F1, antes registrado con 403 por DP-01, respondió correctamente ahora. Fallback disponible de forma dirigida, sin activación automática. | Comparación F1–F6 y decisión de proveedor abajo. |
| Recuperación de Actor | Reserva antes de POST, runId persistido antes de polling. SIGKILL real del proceso después del commit; cliente nuevo consulta ese mismo Actor sin POST adicional. Dataset parcial de un Actor fallido se conserva. Respuesta perdida al iniciar queda incierta y no se repite. | [source-integration.log](source-integration.log): transporte de Apify **controlado**, DB y caída reales. |
| Conservar evidencia parcial | Falla fresca retiene contenido previo con `stale_fallback`, fecha original y fallo. Relectura escasa no borra claims, dirección ni IDs de revisiones respaldadas. | Integración de lectura y regresiones `luma-dossier`/`worker-recovery`. |
| Contraste DP-01 | Se obtuvieron y validaron seis fuentes reales, separadas de fixtures. Se enumeran campos recuperados y pendientes por fuente. | [real-sources.json](real-sources.json) y tabla siguiente. |

## Comparación con las referencias reales de DP-01

[real-sources.json](real-sources.json) contiene fecha efectiva de cada obtención, URLs, tamaño/hash, fragmentos y atributos. Sus IDs `dp05-real-fN` identifican observaciones del smoke; la importación F2 en DB tiene sus propios IDs durables en [real-browser.json](real-browser.json). No se guardó HTML completo.

| Referencia | Obtenido por el lector | Límite o dato pendiente |
| --- | --- | --- |
| F1 · AI Tinkerers SF | Fecha estructurada y fechas visibles, programa/repo/video, acceso por solicitud, sponsors globales OpenAI/CopilotKit/OpenRouter, partners de infraestructura y restricción de sede. | Dirección compartida después de aceptación: no se reconstruye. No se acredita pago, participación local de cada sponsor ni asistencia real. La respuesta HTTP exitosa actual no elimina el 403 histórico de DP-01. |
| F2 · AI Security Hackathon, Luma | Audiencia de seguridad/agentes, programa, acceso y preferencia presencial, Wasmer/TENKI CLOUD anunciados, presentador/hosts/venue partner como menciones separadas; dirección completa y coordenadas públicas. | Luma identifica a Wasmer en JSON-LD, mientras el cuerpo lista hosts con distintos papeles: no se fusionan identidades ni se declara organizador único. Costo de entrada no obtenido del JSON-LD; patrocinio y costo total siguen sin cotización. |
| F3 · ficha Hackathons.team | Fecha, sede EF, dirección 501 Folsom St, ciudad, audiencia, programa y condiciones de participación. | Sin coordenadas: método `unknown`, precisión city y dirección preservada para geocodificación posterior. No se copian coordenadas desde F2 implícitamente. |
| F4 · portada Hackathons.team | Próxima fecha publicada y `Past events: None yet`, conservado como historial declarado. | El mensaje contradictorio de “no hay eventos programados” documentado en DP-01 no apareció en el texto visible extraído ahora. No se fabrica ese conflicto ni se elimina la observación histórica de DP-01. La referencia amplia South Park no se geocodifica ni se promueve a dirección de la edición. |
| F5 · patrocinio Hackathons.team | Office hours/workshop, demostración del producto, introducciones opt-in, reporte posterior; también exclusiones y “We do not publish packages”. | Son términos generales de la iniciativa. No confirman disponibilidad, precio, contactos completos ni un paquete para el 13/09. |
| F6 · Agent Arena | Inicio/fin JSON-LD, encabezado visible sin año, host Vultr, formato, requisitos de aprobación y participación, costo de asistencia USD 0 según JSON-LD. | Solo ciudad: sin venue ni punto. El final UTC del 28/09 se conserva junto al 27/09 local. Entrada gratuita no equivale a patrocinio ni costo total cero. |

Esta comparación cubre las seis fuentes principales de oportunidades. La resolución de antecedentes, empresas y proyectos de DP-01 corresponde a DP-06. La extracción está calibrada para estas páginas en inglés; no es un parser universal de calendarios. CSS externo y JS no se ejecutan en el lector nativo. Los topes de fragmentos producen limitaciones explícitas en vez de completar texto por inferencia.

## Decisión de proveedor y consumo

**Uso real de esta entrega: cero llamadas Exa Contents y cero Actors Apify.** Hubo HTTP público sobre las seis fuentes y una importación real de F2 por navegador/cola/worker. No se necesitó un proveedor pago para recuperar el material. La consulta Exa real de DP-04 es una operación ajena a este smoke y conserva su propio registro.

`runWebsiteCrawler` exige una carencia material declarada por el código llamador. La presencia de APIFY_TOKEN por sí sola no lo dispara. Usa únicamente Website Content Crawler con una URL, profundidad 0, una página, concurrencia 1, sin reintentos, sitemap, llms.txt, archivos, resumen ni proxy de Apify; Firefox, 1024 MB y 120 segundos. `maxTotalChargeUsd=0.25` no se presenta como garantía universal de todos los cargos. Se reserva USD 1 de forma conservadora antes de cada inicio, con un máximo de un Actor por run y **USD 15 agregados en esta instalación**, no por usuario/sesión/investigación. El saldo de la cuenta no se conoce ni se inventa. Un costo superior a la reserva suspende inicios nuevos; un costo desconocido no libera la reserva.

La tabla privada `source_provider_allowance` y la función de reserva serializan el cupo entre tenants. `ProviderConsumption` registra run/operación, costo conocido o desconocido y número de inicios de Actor (no los GET de polling). La prueba concurrente dejó espacio para un solo Actor y comprobó un solo POST entre dos tenants. Solo la DB aislada restablece ese saldo durante tests; no se modificaron créditos reales.

Documentación consultada: [inicio de Actors](https://docs.apify.com/api/v2/actors-runs-post), [input de Website Content Crawler](https://apify.com/apify/website-content-crawler/input-schema), [Exa Contents](https://exa.ai/docs/reference/get-contents). Las respuestas del Actor son controladas en tests; **no se verificó una ejecución real del Actor**, porque la muestra no mostró la carencia requerida para justificarla. El scraper del pipeline antiguo no quedó habilitado ni certificado por esta entrega.

## Verificaciones y entorno

- [tests.json](tests.json) / [tests.log](tests.log): **279 pruebas de funciones/integración aprobadas, cero fallos u omisiones**. PostgreSQL real en el cluster aislado.
- [source-integration.json](source-integration.json) / [log](source-integration.log): repetición final de las **9 comprobaciones** de integración propias, incluida propuesta DP-04 → lectura → reutilización de caché en importador, caída de Actor y cupo entre tenants.
- [e2e-all.json](e2e-all.json) / [log](e2e-all.log): **28 comprobaciones** en seis suites (11 + 9 + 5 + 1 + 1 + 1), con Next, Chromium, DB, cola y workers reales. Fuentes/control de proveedores sintéticos explícitos.
- [e2e-production.json](e2e-production.json) / [log](e2e-production.log): recorrido DP-05 repetido contra el build de producción, con audiencia/sponsors/dirección y conflicto controlado; recarga conserva revisión y no provoca otra consulta; tenant ajeno 404; desktop 1366×900 y móvil 390×844 sin overflow horizontal.
- [real-smoke.json](real-smoke.json) / [log](real-smoke.log), [fuentes](real-sources.json), [navegador real](real-browser.json): consultas públicas reales y recorrido de F2 sobre producción aislada, con datos reales y faltante de costo. No es una comprobación en la DB del usuario.
- [typecheck.json](typecheck.json), [lint.json](lint.json), [build.json](build.json): TypeScript, ESLint y build de producción correctos. [verified-files.json](verified-files.json) identifica archivos de esta entrega y correspondencia con la copia compilada.
- Capturas revisadas: [discrepancia controlada](screenshots/reading-desktop.png), [sponsors controlados](screenshots/reading-sponsors.png), [móvil controlado](screenshots/reading-mobile.png), [fuente real](screenshots/real-desktop.png), [sponsors reales](screenshots/real-sponsors.png), [dirección real](screenshots/real-address.png), [móvil real](screenshots/real-mobile.png).

La primera regresión detectó una etiqueta parcial eliminada y una limpieza de test que no incluía `source_reads`; ambas se corrigieron y la suite completa pasó. `luma-integration.log/json` conserva un intento anterior fallido por expectativas del método antiguo `jsonld_extraction`; esas expectativas se actualizaron para la lectura visible y pasaron en `tests.log`. La comprobación DP-04 descubrió una incompatibilidad entre la proyección Luma y la caché común: se corrigió la lectura de observaciones ya validadas, sin otra descarga. También se comprobó sede con coordenadas sin ciudad, preservando la ciudad anterior cuando ya tenía soporte. El ajuste final presenta una única dirección completa y conserva sus variantes en fragmentos; se volvió a probar en integración y navegador de producción. Los resultados finales indicados arriba corresponden a las correcciones efectivas.

Entorno propio: contenedor `growthx-dp05-verification`, PostgreSQL 17 en **127.0.0.1:55445**; Node 25.5.0. Next y build corrieron en copias temporales sin configuración privada; los workers usaron exclusivamente la DB aislada. `run-check.py` reconstruye el entorno sin claves de proveedores y registra comandos, resultados y duración. Se consultó **solo de lectura** el ledger de la DB compartida: tenía migraciones 001–007, sin 008. No se migró, reinició ni alteró ningún servicio o dato del usuario desde esta sesión. Al cerrar se detuvo únicamente el contenedor propio, preservando sus datos; el PostgreSQL compartido continuaba funcionando. Los procesos propios de Next/worker terminaron al cerrar los tests.

## Cómo probar y frontera de integración

En la app local, con sesión y perfil guardado: **Eventos → pegar https://luma.com/7a4iutvp → Importar → Abrir dossier persistido**. Abrir “Evidence” en Audience, Announced sponsors y Public address. Deben verse fragmentos y localizadores de la página, Wasmer/TENKI CLOUD, dirección con CP, procedencia automática y el costo pendiente. Recargar conserva la misma revisión. La fecha de esta fuente es 13/09/2026; no se altera para que siga siendo futura después del evento. La discrepancia se demuestra con la fixture, no se atribuye a F2.

La lectura HTTP no necesita claves pagas. La migración **008-source-reading.sql** habilita caché durable y reserva/estado del Actor. Su aplicación a la DB del usuario queda para la integración coordinada: sin 008, la importación nativa sigue funcionando y declara caché no disponible; Apify se niega a iniciar sin persistencia. La recarga automática no aplica migraciones ni actualiza variables del worker.

Para reproducir en el cluster de pruebas propio, iniciarlo con `docker start growthx-dp05-verification` y ejecutar, secuencialmente:

```sh
python3 DemoPuentes/evidence/DP-05/run-check.py tests node --test 'tests/**/*.test.ts'
python3 DemoPuentes/evidence/DP-05/run-check.py e2e-all pnpm test:e2e
DP05_REAL_SMOKE=1 python3 DemoPuentes/evidence/DP-05/run-check.py real-smoke node scripts/smoke-source-reading.ts
```

Para producción, compilar una copia independiente sin `.env*` y definir `DP05_PRODUCTION_DIR` con su directorio antes de los dos últimos comandos. No usar la DB compartida para tests.

`readProposedSource({pool,tenantId,runId}, sourceId, options)` consume una propuesta de DP-04 del mismo run/tenant y guarda una nueva `SourceRecord` en el almacén común. Devuelve observaciones con sourceId y EvidenceReference; no sobrescribe el snippet ni crea entidades. El test de integración ejecuta ambos productores y comprueba que el importador reutiliza la caché común. `readKnownSource`/`cachedSourceRead` sirven para otras fuentes admitidas. Hosts nuevos requieren revisión explícita de la allowlist; el contenido de una página nunca amplía permisos.

**Integración restante:** conectar la selección/planificación de candidatos del panel DP-04 a este lector y a la resolución de entidades de DP-06; no se añadió un disparo automático de todas las páginas de discovery al terminar la búsqueda. DP-08 recibe dirección/coordenadas/precisión; geocodificación y mapa de calles siguen sus tickets. Apify queda dirigido y opcional, hasta demostrar una carencia material. No hay bloqueo técnico de DP-05 ni cambio incompatible de contrato. No se hizo commit, push, despliegue ni envío de mensajes externos.


## Integración local posterior — 10/09/2026

Con autorización explícita del usuario, se aplicaron 008–010 en 54329, se configuró Census y se reiniciaron app/worker de localhost:3000. Se conservaron todas las filas anteriores. La integración conjunta pasó 318 pruebas y 29 E2E aislados, build, TypeScript y lint. Dirección geocodificada, ciudad sin pin, coordenadas de fuente y reapertura histórica comprobadas en la sesión local del usuario. Organizador/antecedente/empresa comprobados en vivo; las páginas de proyectos AIT devolvieron 403, por lo que su recorrido completo se acredita solo con pruebas controladas. [Evidencia conjunta y enlaces para abrir los resultados](../local-integration-DP05-DP06-DP08/README.md). Esta actualización sustituye los pendientes de migración/configuración local del cierre original; no cambia la procedencia de sus pruebas anteriores.
