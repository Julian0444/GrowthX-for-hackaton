# DP-08 — Ubicación pública y resolución trazable

Implementación del 10 de septiembre de 2026. [Ticket](../../issues/08-direccion-a-coordenadas.md). Evidencia real y respuestas controladas se identifican por separado. No incluye el mapa de calles de DP-09.

## Dependencias y coordinación

Se leyeron completos el ticket, spec y implementation-plan; se consultaron ubicación, evidencia, presupuesto y operación en finalProduct/PuentesHandoff. Los tickets y README de **DP-03 y DP-05 están verified**: el contrato `publicLocation`, `decodePublicLocation`, `projectEditionPosition`, el lector `readKnownSource`, fragmentos, caché de lectura y revisiones inmutables ya existían. Se reutilizaron; el índice que aún decía DP-05 in-progress no se tomó como fuente de verdad.

[preflight.json](preflight.json) registra HEAD, cambios iniciales y hashes. DP-06 trabajaba simultáneamente. No se editaron `catalog/store.ts`, `catalog/read.ts`, su migración 009, el handoff ni el índice/plan compartido. La migración nueva es **010-location-resolution.sql**. La integración con DP-06 es aditiva en el worker: después de persistir sus ediciones/claims, `resolveRunLocations` resuelve esas revisiones antes de publicar el resultado. DP-08 no certifica la totalidad del ticket DP-06.

## Resultado y criterios

| Criterio/caso | Resultado y verificación |
| --- | --- |
| Coordenadas públicas válidas | Se conserva la revisión de fuente, proveedor, fecha, precisión y estado; cero consulta geográfica y ninguna revisión redundante. F2 real y tests announced/confirmed. |
| Orden de ejes | Contratos `{lat,lng}`, Census `{x:longitude,y:latitude}`, GeoJSON `[lng,lat]`. Pruebas de inversión detectable y fuera de rango; nunca se intercambian silenciosamente. |
| Dirección completa | Adaptador Census; consulta original/normalizada, contenido de fuente que define la versión, IDs de claims originales, proveedor/versión, fecha, match, precisión y condado. Se agrega una fuente y revisión geográfica inmutables. F3 real. |
| Precisión | Census calcula por interpolación de un rango de calle: `precision=address`, `accuracy=interpolated`, `approximate=true`. No se presenta como rooftop/entrada ni precisión métrica comprobada. Dossier, tarjeta y pin SVG conservan la advertencia. |
| Ciudad/calle/ambigüedad | Ciudad sola no consulta y sigue en lista sin marcador (F6 real). Census exige número: calle sin altura queda pendiente. Adaptador controlado capaz de resolver calles admite un único match como `street` aproximado; dos matches quedan pendientes. |
| Estado y contradicciones | Announced/confirmed mantienen soporte; geocodificar no eleva certeza de celebración ni acceso. Contradicción de ciudad, dirección, venue o coordenadas bloquea el punto. Dirección/código postal distinto, county ajeno y varios matches no se filtran para elegir uno silenciosamente. |
| Sede y SF | Solo ubicación de la edición y claim público de dirección. Se excluyen domicilios del organizador y enlaces de mapa ajenos al lugar. Ubicación oculta no se reconstruye. Para coordenadas publicadas: localidad declarada y coherencia región/país/coordenadas. Para Census: ciudad SAN FRANCISCO, estado CA **y county GEOID 06075**, además de coincidencia de calle/altura/ZIP. La bbox es solo control adicional, nunca prueba administrativa única. |
| Caché/límites | Caché durable bajo tenant por proveedor/versión, consulta normalizada y versión del contenido de fuente. Material sintético separado del real. Reserva antes de HTTP, 3 inicios/run, 30/día UTC por instalación y ≥1 s entre inicios. Fallo/respuesta incierta no se reenvía automáticamente; cero proveedor pago. |
| Historial | Nueva dirección crea nueva revisión. Una comparación real de DB con respuestas controladas se reabre conservando bundle, fuentes, coordenadas y revisión originales mediante los consumidores de snapshot existentes. |
| Fallo/degradación | HTTP 503, timeout, respuesta inválida/excesiva, falta de migración/configuración/cupo, cero/múltiples matches: se conserva evento/dirección, causa legible y ausencia de pin. El worker completa el run aun después del fallo geográfico. |
| Seguridad de referencia | Claims originales de la resolución pertenecen a la edición/tenant; fuentes y revisiones usan los upserts y RLS existentes. Tenant ajeno no ve dossier/caché ni puede resolver esa edición. App/queue no pueden ampliar el cupo privado. |

## Proveedor elegido y almacenamiento

**US Census Geocoder**, habilitación explícita del worker con `GROWTHX_GEOCODER=us-census`. La ausencia de esa variable conserva coordenadas públicas y deja direcciones pendientes con explicación. No se modificó `.env.local` ni se activó en el servicio compartido. No necesita clave, tarjeta ni créditos de Exa/Apify.

La [documentación oficial de la API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) exige estructura/número y explica que las coordenadas se calculan sobre rangos de direcciones. Se usa `Public_AR_Current`, `Current_Current` y `layers=Counties`. El proveedor puede actualizar esos aliases: guardamos nombres, instante y resultado original, sin recalcular snapshots al reabrir.

El [material oficial de 2026, página 3](https://www.census.gov/fedcasic/fc2026/pdf/2A_Weister.pdf) identifica estos servicios como gratuitos y públicos. Census describe [TIGER como información geoespacial de dominio público](https://www.census.gov/newsroom/archives/2014-pr/cb14-208.html); por eso se conserva el resultado derivado junto a su atribución. Se guarda un resumen de consulta/match y procedencia, no una copia de la página de evento. Se sigue la [guía de citación de Census](https://www.census.gov/about/policies/citation.html). El proveedor no aporta verificación del evento ni garantiza disponibilidad continua.

Alternativas consideradas:

- **Nominatim público:** la [política oficial](https://operations.osmfoundation.org/policies/nominatim/) impone capacidad agregada, identificación, atribución/ODbL y restricciones sobre búsquedas sistemáticas y uso genérico desde plataformas de generación. No se implementó ni activó como fallback.
- **Proveedor comercial:** requiere revisar tarifa, autorización presupuestaria y licencia de almacenamiento. No hay presupuesto nuevo autorizado; los créditos Exa/Apify no lo cubren. No se abrió cuenta ni se hizo llamada paga.
- **Instancia propia:** exige infraestructura/datos y operación adicionales; innecesaria para esta muestra SF.

Census es suficiente para una dirección pública numerada y permite historia persistida. Su límite de precisión se refleja explícitamente. Una calle sin número continúa pendiente con este adaptador; el contrato permite que otro proveedor apto aporte una resolución inequívoca y aproximada sin cambiar el mapa.

## Pruebas controladas

- `tests/connectors/location-resolution.test.ts`: source coordinates, announced/confirmed, ejes GeoJSON, legacy unknown, ciudad/oculta/conflictos, homónimos, rango, county, match incorrecto/ambiguo, errores HTTP/redirección/cuerpo/tamaño/timeout, metadatos runtime y exclusión de oficinas.
- `tests/integration/location-resolution.test.ts`: DB/roles reales; geocodificador controlado. Persistencia, replay, caché entre runs/versiones, comparación histórica, lista sin punto, fallo con run completed, street único/múltiple y cupo agregado entre tenants.
- La recuperación geográfica usa una fila `started` sin respuesta, simulando la frontera posterior a la reserva. **No se atribuye un SIGKILL real de geocodificación a esta prueba.** Se comprueba que no se repite el HTTP incierto. Las suites existentes de worker sí realizan sus propias pruebas de caída.
- Las fixtures nunca activan Census real por la presencia de configuración: requieren inyección explícita de transporte en tests. El cacheKey distingue el material sintético.

[tests.json](tests.json) / [tests.log](tests.log): **313 pruebas aprobadas, cero fallos/omisiones**, ejecutadas secuencialmente sobre copia y DB propias. El guard de puerto de la prueba DP-06 se adaptó **solo en la copia** de 55446 a 55448. Un primer intento paralelo expuso interferencia entre tests que modifican cupos comunes de Exa; la ejecución serial aprobó. No se cambió la lógica de producción ni se ejecutó contra la DB de DP-06 para hacer pasar esa prueba.

[connectors-final.json](connectors-final.json) registra **16** comprobaciones finales de conectores DP-08/05; [integration-final.json](integration-final.json), **18** de integración DP-08/05 después del último ajuste de localidad contradictoria. Son repeticiones específicas, no se suman a las 313 como pruebas distintas. [targeted.json](targeted.json) conserva un corte anterior. Las pruebas anteriores de DP-03/05 se tomaron como evidencia de esas entregas, no como ejecución nueva de DP-08.

[e2e.json](e2e.json) / [e2e.log](e2e.log): **28 comprobaciones de navegador aprobadas**, cero omisiones. [lint-final.json](lint-final.json) y [build-final.json](build-final.json): ESLint y build de producción con TypeScript aprobados en la copia propia. [verified-files.json](verified-files.json) registra los **23 archivos** de implementación/pruebas de DP-08; todos coinciden byte a byte con esa copia.

**Coordinación pendiente ajena a los criterios de ubicación:** el typecheck del árbol compartido detectó `tests/e2e/relationships.spec.ts:54` de DP-06 con flag regex `/s` incompatible con el target TypeScript existente. Se avisó al usuario, respetando su instrucción de coordinar una edición simultánea incompatible; no se editó ese archivo compartido. Para verificar el build propio se expresó la misma regex como `[\s\S]` únicamente en la copia. [copy-adaptations.json](copy-adaptations.json) documenta ambas adaptaciones de pruebas DP-06. No se afirma que el typecheck global de esa sesión concurrente haya quedado corregido.

## Consultas y consumidores reales

[provider-probe.json](provider-probe.json): una consulta inicial real a Census para 501 Folsom St. [real-consumers.json](real-consumers.json): tres fuentes reales, navegador Chromium, Next de producción, cola/worker y PostgreSQL propios.

1. **F3 · Hackathons.team / AI Security Hackathon:** lector existente → dirección 501 Folsom St → Census → `{lat:37.787215024828,lng:-122.394478898761}`, interpolación `address`, county 06075 y claims originales. El pin aproximado del SVG abre el mismo dossier.
2. **F6 · Agent Arena:** solo San Francisco; se mantiene en la tarjeta/lista, sin marcador ni geocodificación.
3. **F2 · Luma:** `{lat:37.786980299999996,lng:-122.39447709999999}` de JSON-LD; sin otra solicitud a Census. No se hace coincidir con la interpolación ni se sobrescribe la posición publicada.

**Consumo real total de geocodificación: 2 solicitudes gratuitas** (sondeo + 1 dentro del worker), USD 0; cero llamadas Exa/Apify desde DP-08. La reapertura usa DB sin nuevas consultas. Los HTTP a las fuentes son reales, no fixtures; los errores, ambigüedad y el cambio histórico de dirección se prueban de forma controlada.

Capturas: [dirección resuelta y procedencia](screenshots/real-geocoded-address.png), [mapa SVG actual](screenshots/real-current-map.png), [coordenadas publicadas](screenshots/real-published-coordinates.png), [móvil](screenshots/real-mobile.png). Se verifican 1366×900 y 390×844, sin overflow horizontal.

## Cómo comprobarlo y frontera DP-09

Entorno propio: contenedor `growthx-dp08-verification`, PostgreSQL en **127.0.0.1:55448**. Las migraciones 001–010 se aplicaron ahí. Next usa puertos libres propios; worker y build usan una copia temporal, cuya ruta está en [production-path.txt](production-path.txt). Ningún comando modifica datos, procesos o migraciones del servicio de localhost:3000/54329.

Para reproducir después de iniciar únicamente ese contenedor:

```sh
docker start growthx-dp08-verification
python3 DemoPuentes/evidence/DP-08/run-check.py integration node --test tests/integration/location-resolution.test.ts
```

Para el smoke real, usar el build propio informado, sin `.env.local`:

```sh
DP08_REAL_SMOKE=1 DP08_PRODUCTION_DIR="$(cat DemoPuentes/evidence/DP-08/production-path.txt)" python3 DemoPuentes/evidence/DP-08/run-check.py real-smoke node scripts/smoke-location-resolution.ts
```

Si la copia temporal ya no existe, `python3 DemoPuentes/evidence/DP-08/prepare-copy.py` crea otra, sin archivos `.env*`; después compilar con `DP08_CHECK_CWD="$(cat DemoPuentes/evidence/DP-08/production-path.txt)" python3 DemoPuentes/evidence/DP-08/run-check.py build node node_modules/next/dist/bin/next build --webpack`. El runner fija exclusivamente la DB de DP-08 y elimina claves externas del entorno.

Cada repetición del smoke real puede hacer otra solicitud gratuita; no es la prueba rutinaria de CI. El script crea una sesión temporal propia, importa por los consumidores actuales y cierra sus procesos. No imprime tokens de sesión. `verify-location-reopen.ts` reabre la evidencia real guardada sin worker ni proveedores.

En la aplicación con ese entorno: **Eventos → Background source URL → URL F3 → Research organizer & projects → Open background dossier → Ubicación pública → Procedencia de ubicación**. **Mapa** muestra la cuadrícula existente y el pin aproximado; F6 queda en la lista. Para F2: importador Luma → Abrir dossier persistido. Son recorridos comprobados, sin depender de DP-09.

Para DP-09 están listos `projectEditionPosition` y el `mapPoint` del dossier con `editionId`, `editionRevisionId`, `{lat,lng}`, `geojson` Point `[lng,lat]`, estado, precisión, método, accuracy y approximate; `publicLocation.resolution` conserva consulta, fuente y caché. `withoutPointReason` explica la ausencia de punto. Usar esas mismas revisiones para lista/mapa/snapshot; no geocodificar desde el navegador. Faltan calles/tiles, navegación cartográfica y demás comportamiento propio de DP-09.

La [reapertura final de producción](reopen-production.json) volvió a comprobar las revisiones reales, método/precisión/consulta, tarjeta de ciudad sin punto y móvil, **sin HTTP nuevo a fuentes ni proveedores**. Capturas finales: [procedencia](screenshots/final-address.png), [móvil](screenshots/final-address-mobile.png), [ciudad en lista con causa](screenshots/final-city-without-pin.png). Con F2 y F3 superpuestos en la cuadrícula actual, el click de un marcador puede interceptarse; el teclado (foco + Enter) abre la edición correcta. El click individual ya se había comprobado antes de agregar el segundo listado. Resolver agrupación/superposición pertenece a DP-09.

## Límites operativos

No hay reintento automático de una geocodificación fallida/incierta bajo la misma versión. Una nueva fuente con contenido distinto produce otra clave; una ampliación futura puede añadir un refresco explícito con presupuesto y revisión nuevos. Cupo agotado o proveedor deshabilitado dejan la dirección pendiente. No se confirmó acceso, realización del evento, venue exacto, precisión métrica, vigencia comercial ni ROI.

Sin commit, push, despliegue, mensajes externos, handoff ni índice compartido. No se expusieron claves de proveedores ni tokens de sesión.

Al cerrar se detuvieron únicamente los procesos y el contenedor de DP-08; sus datos y el build se conservaron para reproducir. Los hashes de handoff, índice/plan y README compartidos son iguales al inicio. `catalog/read.ts` cambió concurrentemente por DP-06; DP-08 no lo editó.


## Integración local posterior — 10/09/2026

Con autorización explícita del usuario, se aplicaron 008–010 en 54329, se configuró Census y se reiniciaron app/worker de localhost:3000. Se conservaron todas las filas anteriores. La integración conjunta pasó 318 pruebas y 29 E2E aislados, build, TypeScript y lint. Dirección geocodificada, ciudad sin pin, coordenadas de fuente y reapertura histórica comprobadas en la sesión local del usuario. Organizador/antecedente/empresa comprobados en vivo; las páginas de proyectos AIT devolvieron 403, por lo que su recorrido completo se acredita solo con pruebas controladas. [Evidencia conjunta y enlaces para abrir los resultados](../local-integration-DP05-DP06-DP08/README.md). Esta actualización sustituye los pendientes de migración/configuración local del cierre original; no cambia la procedencia de sus pruebas anteriores.
