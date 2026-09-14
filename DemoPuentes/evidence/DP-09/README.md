# DP-09 — Mapa de calles conectado a investigaciones

Verificado el 10/09/2026. Los nueve criterios del ticket están comprobados. `verification-summary.json` concentra los resultados finales y el cierre del entorno propio. Esta evidencia corresponde al árbol de trabajo compartido con DP-07; no implica un commit ni un despliegue. El handoff, el índice del plan y el README compartido conservan sus hashes iniciales (`shared-files-preserved.json`).

## Resultado y frontera con DP-08 / DP-07

`SfEventMap` usa MapLibre GL JS 6.9.0 y OpenFreeMap Liberty. Muestra calles, barrios, costa, zoom, pan, orientación, escala y atribución. La selección usa `ResearchPresentationState` y los `editionId` / `editionRevisionId` existentes. No agrega una base geográfica ni geocodifica en el navegador.

DP-08 aporta `projectEditionDossierView` / `projectEditionPosition`, la procedencia y la política de precisión. Se conservan ubicaciones anunciadas y confirmadas; una dirección interpolada aparece aproximada; ciudad sola, registro sin procedencia y contradicciones no crean un pin. Las coordenadas se pasan como `[lng, lat]`. Un marcador nunca acredita acceso, celebración o retorno comercial.

`runEditionDossiers` define un único conjunto para lista y mapa: resultado del run SF, revisiones explícitas de importación/background, o snapshot de comparación. El catálogo transporta las cadenas de revisiones, pero no agrega sus demás ediciones a una investigación. Si falta la revisión solicitada, no se sustituye por la vigente. Los antecedentes de otro lugar incluidos en un run permanecen en la lista y no se proyectan como puntos de SF.

Se integraron los cambios concurrentes de DP-07: razones de `decisionReading` cuando existen, snapshots con antecedentes para abrir dossiers y organizadores, y selección/revisión compartidas. Los datos actuales se abren con «Ver catálogo actual (otra vista)» y abandonan expresamente el contexto histórico.

La cámara cambia por selección o por «Encuadrar resultados». Agregar resultados o recibir polling conserva la instancia y la exploración. Marcadores cercanos se agrupan en pantalla sin promediar ni modificar coordenadas: el popup permite elegir cada edición. En móvil, Lista/Mapa mantiene la selección y conserva la instancia entre alternancias. Estilo, tiles, WebGL no disponible o pérdida del contexto exponen el error, el reintento y la lista; el desmontaje libera mapa, controles, listeners, observer, timers, marcadores y popup.

## Matriz de aceptación

| Criterio | Evidencia comprobada |
| --- | --- |
| Calles, barrios, costa, controles, atribución y producción | `real-production.json`, `real-reopen.json`, capturas reales; worker y shared 200; builds Turbopack y webpack |
| Mismo conjunto filtrado del run | Tests `sf-map.test.ts` y `sf-street-map.spec.ts`; señuelo de catálogo excluido; localhost: 1 evento del run frente a 14 del catálogo |
| Evento nuevo sin reiniciar ni recenter continuo | Poll controlado agrega un punto: mismo canvas conectado y misma posición del marcador después de pan; encuadre explícito |
| Selección compartida / múltiples eventos por sede | Tarjeta → pin → popup → dossier con mismo ID y revisión; grupo de dos ediciones distingue ambas; teclado Enter |
| Contenido del popup | Nombre, fecha, dirección/venue, pertinencia, precisión/estado, Abrir evento seguro y Abrir dossier; leyenda de límites |
| Política DP-08 | Unitarios: anunciado, confirmado, aproximado, contradicho, ciudad, registro sin procedencia; real: 501 Folsom interpolada / condado 06075 |
| Sin punto, conteos y móvil | Cero puntos conserva lista y motivo; búsqueda/filtro compartido; 390×844 sin overflow y misma selección al alternar |
| Fallos y lifecycle | Estilo abortado, tiles abortados, WebGL inicial deshabilitado y pérdida real del contexto; retry vuelve a una instancia; cambio de run/desmontaje no duplica canvas |
| Historia y catálogo explícito | Snapshot controlado mantiene a-r1 frente a catálogo a-r2; localhost comparación antigua conserva revisión Luma anterior y 0 puntos; catálogo actual se abre separadamente |

## Pruebas y builds aislados

`run-isolated.py` copia fuentes y dependencias a un directorio temporal propio, excluye `.env*` y `.next`, usa Node 25.5 y PostgreSQL 17 del contenedor `growthx-dp09-verification`, puerto **55459**. No usa la base de la app en 54329. Los tests de regresión usan `growthx`; el smoke real usa `growthx_dp09_real` para que la limpieza de fixtures de la regresión no afecte los datos reales de prueba. No se cargan claves Exa, Apify o Gemini.

| Comprobación | Resultado / registro |
| --- | --- |
| Unitarios, contratos, conectores, integración y aceptación existentes + mapa | **334/334**; `regression.json`, `regression.log` |
| E2E completo previo, incluidos consumidores ajustados y comparación DP-07 | **30/30**; `e2e.json`, `e2e.log` |
| Mapa en producción Turbopack, Chrome instalado | **10/10** (9 casos + padre); `map-e2e.json`, `map-e2e.log` |
| Mismo mapa en producción webpack | **10/10**; `map-webpack-e2e.json`, `map-webpack-e2e.log` |
| Build por defecto / webpack | Exit 0; `build.json`, `webpack-build.json` |
| TypeScript / ESLint | Exit 0, sin errores; `typecheck.json`, `lint.json`; confirmados también sobre la copia webpack final en `webpack-typecheck.json`, `webpack-lint.json` |
| Smoke real, creación desde la UI | Exit 0; `real-production-final.json`, detalle en `real-production.json` |
| Reapertura con webpack y cartografía real | Exit 0; `real-webpack-reopen.json`, detalle en `real-reopen.json` |
| Chrome interactivo en localhost:3000 | `local-chrome.json`, `local-services.json` y capturas `local-*` |

La regresión completa terminó antes del último ajuste de la etiqueta de contexto y del z-index del popup; ambos builds finales y las dos suites del mapa incluyen esos cambios. El ajuste posterior de tipado del test acordado con DP-07 pasó `tsc`; la última modificación del test solo ordena el cierre de los procesos propios y pasó en ambos builds. Los logs de Node contienen la advertencia preexistente `MODULE_TYPELESS_PACKAGE_JSON`; no hubo tests omitidos ni fallidos en los registros finales.

Los E2E del mapa interceptan datos HTTP y cartografía con fixtures explícitos, pero ejecutan React, MapLibre, WebGL, CSS, worker y shared reales en Chrome. `controlled-map-assets.json` registra ambos módulos servidos con 200 y cero `pageerror`. Esta cobertura controlada es distinta de las fuentes reales que se describen abajo. `test:map` es el comando adicional para CI; se ejecuta después del build aislado, junto con la regresión habitual.

## Fuentes y mapa reales

Chrome **152.0.7977.83**, desktop **1366×900** y móvil **390×844**. Se investigaron desde el formulario real, con Next de producción y worker propios:

- [AI Security Hackathon](https://www.hackathons.team/events/ai-security-hackathon-2026/): run `061d1311-c7e6-41a6-8091-fe026b333b57`; edición `edition-4322ef61414369d9f52fb3a5`, revisión `edition-rev-0a61613a0e9c9f8d969a8091-geo`. La fuente publica 501 Folsom St y EF. Census devuelve `37.787215024828, -122.394478898761`, interpolada, condado 06075. Popup y dossier usan la misma revisión y muestran la procedencia y sus límites.
- [The Agent Arena](https://cerebralvalley.ai/e/vultr-the-agent-arena): ubicación pública solo ciudad, sin punto. Su antecedente en Paris permanece como antecedente en la lista del mismo run, tampoco como pin de SF.

`real-production.json` conserva resultados, revisiones, fuentes, operaciones y respuestas 200 del estilo, vector tiles, sprites, fuentes tipográficas y módulos MapLibre. `real-reopen.json` conserva los mismos runs y la misma operación Census al reabrir sobre webpack: no agrega una resolución geográfica. Ambos tienen cero errores de página. Las capturas `real-production-*` se actualizaron con la reapertura final sobre webpack.

Consumo DP-09: **0 llamadas a proveedores pagos**. Se hicieron dos consultas gratuitas a Census en total: una en el primer intento aislado y una en el smoke final. El primer intento compartía la base de regresión y su sesión fue retirada por la limpieza de esos tests; se separó el smoke real en su propia base y se repitió con cierre limpio. Ninguno de esos intentos tocó datos de localhost. La cartografía es pública y las lecturas HTTP de fuentes están registradas por los runs; no se presentan como investigación humana ni evidencia de retorno.

## Activación y comprobación en localhost

No se requirió migración de DP-09, cambios de `.env.local`, reseed ni borrado. Se generaron los dos assets MapLibre del paquete instalado. Durante la coordinación, DP-07 reactivó el contenedor local existente que se había encontrado detenido; DP-09 conservó Next y worker compartidos. La app, worker y datos locales quedan disponibles. `local-services.json` registra HTTP 200 de `/`, worker y shared; las pruebas automatizadas nunca apuntaron a esta base.

En Chrome interactivo se reabrió información ya guardada, sin lanzar nuevas investigaciones locales:

1. [Caso real con dirección](http://localhost:3000/?run=fda043a0-ae92-4809-b150-d0d71c62b1d8): **Eventos → Ver en mapa → Abrir dossier → Procedencia de ubicación**. Un evento del run, una ubicación aproximada; misma revisión `edition-rev-72f2a9cce09525f99c185f1e-geo` en lista, popup y dossier. Elegir la casilla permite llevar esa edición a comparación.
2. En móvil, **Lista / Mapa** conserva selección. «Encuadrar resultados» recupera el área tras explorar con pan/zoom. Buscar o filtrar ubicación afecta ambas vistas.
3. [Caso solo ciudad](http://localhost:3000/?run=7d43b762-b599-4759-b657-0848612a94c2): The Agent Arena y su antecedente conservados, cero puntos de SF y razones visibles.
4. [Comparación histórica](http://localhost:3000/?run=21279a0a-9fe0-4968-b900-29af59463fe6): dos ediciones / cero puntos. `luma-7a4iutvp` mantiene la revisión `luma-70e00629-8a56-452e-a84c-f5944913c144-edition`; «Ver catálogo actual (otra vista)» muestra expresamente las 14 ediciones y la revisión más reciente `luma-4ea79f69-9aa0-45c4-a7b9-31fb3be59455-edition`.

Estos enlaces requieren la sesión local ya existente del usuario. Cambian la vista; no recalculan ni geocodifican la comparación.

## Configuración y compatibilidad del proveedor

La [documentación oficial de MapLibre](https://maplibre.org/maplibre-gl-js/docs/) describe la distribución ESM y los módulos separados para Next. `copy-maplibre-worker.mjs` copia **worker y shared** a `public/maplibre/<versión>/`; `dev` y `build` lo ejecutan automáticamente. El runtime fija esa URL, carga el motor solo en cliente y `app/layout.tsx` importa CSS de MapLibre más los estilos locales. Los archivos generados se ignoran en Git y ESLint; no se versiona ni modifica el vendor.

El estilo inicial sigue el [quick start de OpenFreeMap](https://openfreemap.org/quick_start/). Puede reemplazarse mediante `NEXT_PUBLIC_SF_MAP_STYLE_URL` **antes de compilar**; es una URL pública incluida en el cliente. OpenFreeMap publica un servicio sin API key, pero [no ofrece SLA](https://openfreemap.org/). La atribución se conserva según el estilo. Si se usa CSP, deben permitirse los módulos de worker del mismo origen y los recursos del proveedor elegido. No se inventó una política CSP nueva para la app.

## Archivos y reproducción

Implementación: `sf-event-map.tsx`, `sf-event-map.css`, `research-events.tsx`, integración en `research-dashboard.tsx`, `run-editions.ts`, `map-opportunities.ts`, `app/layout.tsx`, paquete/lock, `.gitignore`, configuración ESLint y `copy-maplibre-worker.mjs`.

Verificación: fixtures `sf-map.ts`, `sf-map.test.ts`, `sf-street-map.spec.ts`, `smoke-street-map.ts`; consumidores de pruebas `trust-evidence`, `sf-organizer-research`, `research-brief` y `persisted-evaluation`. Las pruebas antiguas ahora abren el dossier desde el popup y eligen explícitamente la vista de catálogo cuando corresponde. Los dos consumidores que usan mapa ejecutan Chrome instalado y cartografía controlada. `verified-files.json` identifica hashes y coincidencia con las copias finales, incluyendo módulos compartidos de los que depende DP-09; no atribuye todo el diff acumulado a este ticket.

Para repetir en esta máquina desde la raíz del repositorio, con Docker y Chrome disponibles:

```sh
docker start growthx-dp09-verification
python3 DemoPuentes/evidence/DP-09/run-isolated.py prepare
python3 DemoPuentes/evidence/DP-09/run-isolated.py build pnpm build
python3 DemoPuentes/evidence/DP-09/run-isolated.py map-e2e pnpm test:map
python3 DemoPuentes/evidence/DP-09/run-isolated.py regression node --test 'tests/**/*.test.ts'
python3 DemoPuentes/evidence/DP-09/run-isolated.py e2e pnpm test:e2e
python3 DemoPuentes/evidence/DP-09/run-isolated.py typecheck pnpm exec tsc --noEmit
python3 DemoPuentes/evidence/DP-09/run-isolated.py lint pnpm lint
```

Para webpack: `prepare-webpack`, luego `webpack-build pnpm build --webpack` y `map-webpack-e2e pnpm test:map`. `real-webpack-reopen node scripts/smoke-street-map.ts --reopen` reutiliza la base real conservada y descarga cartografía pública; omitir `--reopen` hace una investigación nueva con lecturas HTTP y Census. El contenedor DP-09 se deja detenido al cerrar, con sus datos conservados; la app local y el contenedor DP-07 permanecen independientes.

## Pendiente fuera de DP-09

Sin criterios pendientes de este ticket. No se verificó un despliegue remoto ni se creó uno. DP-10/11/12 conservan su alcance de experiencia general, brief/campaña y aceptación integral de la demo; este cierre no los da por terminados. La disponibilidad futura del proveedor de cartografía depende de la red y del servicio; el fallback a lista está comprobado. Handoff e índice siguen sin actualizar por la instrucción de trabajo paralelo del usuario.
