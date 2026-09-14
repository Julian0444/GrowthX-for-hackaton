# DP-08 — Conservar ubicación y resolver direcciones a coordenadas

Status: ready-for-agent
Execution: verified

**Fase:** D — Ubicación.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>), [DP-05](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/05-lectura-completa-y-apify.md>).

## Objetivo

Hacer que un evento investigado con dirección pública pueda aparecer en el mapa sin perder precisión, incertidumbre o procedencia.

## Alcance y dependencias

Preservar dirección/venue/ciudad y coordenadas publicadas; resolver direcciones cuando falten coordenadas mediante adaptador configurable. Persistir el resultado como revisión de evidencia geográfica.

## Criterios de aceptación

- [x] Coordenadas de la fuente válidas se usan con su procedencia y sin consulta adicional. Conservar orden lat/lng explícito entre contratos, GeoJSON y proveedores.
- [x] Una dirección completa resuelta registra consulta, proveedor, método, precisión, fecha y vínculo al claim original; la persistencia cumple las condiciones del proveedor elegido.
- [x] Elegir y documentar proveedor en este ticket después de comprobar disponibilidad, costo y almacenamiento; no asumir que créditos de Exa/Apify cubren otro servicio.
- [x] Ciudad sola no genera pin de venue. Calle sin altura solo admite representación aproximada si la resolución es inequívoca; múltiples matches quedan pendientes.
- [x] announced y confirmed pueden producir representación con etiqueta adecuada; geocodificar no confirma celebración ni acceso. Contradicciones materiales no quedan como punto exacto aparentemente cierto.
- [x] No usar oficinas del organizador, centro de SF o direcciones ocultas como venue. La validación de SF no depende solamente de una bounding box.
- [x] Cache por consulta normalizada y versión de fuente; límites de proveedor desde servidor. Fuente nueva puede crear revisión sin desplazar ubicaciones de snapshots anteriores.
- [x] Una geocodificación fallida conserva evento y dirección en la lista, con causa legible; no bloquea el run de investigación.

## Demostración

Un evento con dirección completa y sin coordenadas obtiene ubicación trazable. Otro con solo SF permanece en la lista sin un falso marcador.

## Qué lo verifica

Dirección completa, calle ambigua, ciudad sola, homónimo en otra ciudad, lat/lng intercambiados detectables, coordenadas fuera de rango, source coordinates sin llamada, error del proveedor, caché y revisión histórica.

## Módulos y archivos orientativos

- `frontend/lib/api/luma.ts`
- `frontend/lib/contracts/evaluation.ts`
- `frontend/lib/contracts/evaluation-validation.ts`
- `frontend/lib/server/catalog/luma-adapter.ts`
- `frontend/lib/server/catalog/store.ts`
- `frontend/lib/server/catalog/read.ts`
- `frontend/lib/server/connectors/ (adaptador geográfico)`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

Sin autocompletado global de direcciones ni rutas/tiempos de viaje. El proveedor es intercambiable; no atar los contratos al primer servicio.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.

Inicio DP-08 (10/09/2026): ticket completo, spec, plan y secciones de producto/handoff leídos. DP-03/05 verified contrastados con tickets, README de evidencia y código. Se reutilizan publicLocation, projectEditionPosition, lector común y revisiones append-only. Árbol inicial en evidence/DP-08/preflight.json; DP-06 trabaja en paralelo. DB propia 55448, build/worker propios; sin tocar servicios/datos de 3000 ni índice/handoff. Proveedor evaluado: US Census Geocoder, gratuito, sin clave; primera consulta real 501 Folsom St obtuvo coincidencia única y county 06075. Se preservará precisión interpolada, sin prometer rooftop ni acceso. Configuración explícita desde servidor, sin gasto nuevo.


Cierre DP-08 (10/09/2026): **verified contra los ocho criterios de ubicación**. Se reutilizan las coordenadas públicas válidas con su procedencia, sin consulta ni revisión redundante. Las direcciones numeradas se resuelven mediante **US Census Geocoder**, gratuito y sin clave, con interpolación explícita, consulta/versión/fecha, county 06075, IDs de claims originales, caché tenant/material/versión de fuente y revisión geográfica inmutable. Se conserva announced/confirmed sin confirmar celebración/acceso. Ciudad sola, calles no resueltas inequívocamente, ocultamiento, homónimos, ejes inválidos, discrepancias y fallos no generan puntos falsos; la lista conserva dirección y causa. Límites del servidor: 3 inicios/run, 30/día UTC agregados y ≥1 s entre inicios; ningún presupuesto pago adicional.

Proveedor/almacenamiento: se comprobó disponibilidad por consulta real y se consultaron [API oficial](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), [servicios gratuitos de Census](https://www.census.gov/fedcasic/fc2026/pdf/2A_Weister.pdf) y [TIGER de dominio público](https://www.census.gov/newsroom/archives/2014-pr/cb14-208.html). Persistencia y atribución aptas para conservar resultados históricos; precisión interpolada, no rooftop. Nominatim público no se implementó por su política/capacidad; no se abrió un proveedor comercial. Configuración explícita `GROWTHX_GEOCODER=us-census` solo en el worker propio; el servicio compartido conserva su configuración.

Evidencia: **313 pruebas de regresión y 28 E2E aprobadas**, cero omisiones; después del último ajuste se aprobaron 16 comprobaciones de conectores y 18 de integración DP-08/05. Build/TypeScript de la copia aislada y ESLint correctos; los 23 archivos de DP-08 coinciden con ella. La comparación histórica usa DB real y geocodificador controlado; reabrir después de otra dirección conserva bundle y punto originales. Se simula respuesta incierta posterior a reserva (sin atribuir un SIGKILL real a geocodificación). [Matriz, comandos, límites y archivos](../evidence/DP-08/README.md).

Smoke **real** con Next/worker/cola/DB/Chromium propios: F3 Hackathons.team → 501 Folsom St → punto interpolado `{lat:37.787215024828,lng:-122.394478898761}` con claim/proveedor; F6 Agent Arena sigue en lista sin pin; F2 Luma conserva `{lat:37.786980299999996,lng:-122.39447709999999}` sin otra consulta. Se verificaron dossier, pin, recarga y móvil, y una reapertura final sin proveedores. **Dos solicitudes reales gratuitas a Census en total** (sondeo + worker), USD 0, cero Exa/Apify. [Resultado](../evidence/DP-08/real-consumers.json) y [reapertura](../evidence/DP-08/reopen-production.json). Superposición del SVG existente: selección accesible por teclado verificada; agrupación/calles corresponden a DP-09.

Integración: Luma y el nuevo productor de ediciones DP-06 pasan por el mismo resolver; DP-09 recibe identidad/revisión, `{lat,lng}`, GeoJSON `[lng,lat]`, precisión, estado, método, approximate y withoutPointReason. Migración aditiva **010** aplicada únicamente a PostgreSQL propio en 55448; build y puertos propios. Se conservaron cambios existentes. Sin editar handoff/índice/store/read, sin tocar servicios/datos de localhost:3000/54329, sin commit/push/despliegue/mensajes externos ni credenciales expuestas.

Coordinación pendiente de DP-06, **no una falta de ubicación de DP-08**: su nueva prueba `frontend/tests/e2e/relationships.spec.ts:54` usa `/s`, incompatible con el target TS del repo. Se consultó al usuario y no se editó el archivo compartido. La copia de verificación usa la expresión equivalente `[\s\S]`; también adapta únicamente allí el guard de DB de una prueba DP-06 a 55448. El typecheck global del árbol compartido no se presenta como corregido. Los criterios de este ticket se comprobaron con aplicación, datos y contratos de DP-08 idénticos a los del build.
