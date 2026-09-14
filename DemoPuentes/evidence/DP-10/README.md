# DP-10 — Experiencia de investigación y evidencia

Cierre local del 10/09/2026 (las últimas comprobaciones llevan fecha UTC 11/09). El alcance de DP-10 está implementado; esta matriz distingue interacción controlada de revisión con fuentes reales. No acredita el cierre global de DP-11/12 ni una decisión comercial.

## Resultado observable

- Brief compacto con objetivo declarado/provisional, presupuesto, moneda y ventana; edición mediante los formularios y revisiones existentes. La comparación usa el perfil de su run, aunque haya otro brief más reciente.
- Tarjetas con nombre, fecha local legible, razón, pendiente, enlace público y siguiente acción. La comparación presenta primero la prioridad de investigación persistida, sin recalcular un ranking de inversión. Secure Agents Buildathon aparece como antecedente de AIT; la edición futura no se presenta como su propio antecedente.
- En desktop, lista y mapa conectados; evidencia lateral que conserva mapa, selección y posición. En móvil, alternancia lista/mapa y diálogo de evidencia completo con foco contenido y retorno al control original. La vista del evento seleccionado queda dentro del mapa, incluso en bordes y mapas pequeños; no mueve la cámara.
- Progreso derivado de etapas, candidatos y hallazgos guardados. Las páginas propuestas no se presentan como eventos ya extraídos. El orden de llegada de las tarjetas se conserva durante polling.
- Fuentes resumidas una vez por expediente; cada campo permite abrir su fragmento. IDs, snapshots, revisiones, intentos, preguntas persistidas y respuesta técnica siguen disponibles en desplegables. Interfaz principal en inglés; citas, contenido del comprador y explicaciones históricas conservan su texto original.
- En una comparación, la explicación de su brief se separa de las hipótesis del brief con el que se leyeron originalmente las fuentes. No se reescriben claims históricos para traducir o actualizar esa lectura.
- Vacíos, filtros sin resultados, ciudad/sede pendiente, contradicción, cotización incompleta, caída de proveedor/mapa/servidor y run inaccesible tienen mensajes y recuperación. Una lectura fallida deja de anunciar carga indefinida.

## Dependencias contrastadas antes de implementar

| Dependencia | Cierre y evidencia leídos | Código reutilizado y comprobación |
| --- | --- | --- |
| DP-03 | [Ticket](../../issues/03-brief-y-contratos-de-investigacion.md), [matriz](../DP-03/README.md) | `ResearchBriefInput`, perfil versionado, `ResearchPresentationState`, fuentes con fragmentos y ubicación pública. E2E de dos briefs, preguntas, objetivo/éxito/moneda y reapertura; misma revisión entre lista, pin y expediente. |
| DP-07 | [Ticket](../../issues/07-comparacion-y-recomendacion-explicable.md), [matriz](../DP-07/README.md), cierre actual del handoff | `ComparisonReading`, `AlternativeReading`, `projectComparisonResult`, bundles fijados, editor/diferencias y decisiones existentes. E2E de comparación y revisión; lectura real del run v5 y caso sin soporte pertinente. |
| DP-09 | [Ticket](../../issues/09-mapa-sf-integrado.md), [matriz](../DP-09/README.md), cierre actual del handoff | MapLibre 6.9.0/OpenFreeMap, selección y agrupación existentes, política de DP-08 y revisiones del run. E2E de cámara estable, filtros, agrupación, contexto perdido, fallo de estilo/tiles y reapertura geográfica. Un punto real aproximado de Census en 501 Folsom; cero puntos para ciudad sola o sede privada. |

También se leyeron completos ticket (Execution/Comments), spec y plan; se consultaron finalProduct y PuentesHandoff. El índice todavía mostraba DP-05–09 pendientes/en progreso pese a sus cierres verificados: se consolidó con enlaces, sin atribuir esos trabajos a DP-10.

## Matriz de aceptación

| Criterio | Evidencia de interacción | Revisión real |
| --- | --- | --- |
| Brief compacto editable, resultados, enlace y acción | `research-brief.spec.ts`, `explicable-comparison.spec.ts`, caso desktop de `research-experience.spec.ts` | [Comparación inicial](screenshots/real-comparison-desktop.png), [editor](screenshots/real-brief-editor-desktop.png), [fuente abierta](screenshots/real-source-open.png). Acciones de AIT: Inspect evidence termina en y=836,8 y Record decision en y=886,8, viewport 1366×900. |
| Lista/mapa y evidencia lateral o móvil | E2E de mapa + selección/mapa conservados y diálogo móvil | [Lista/mapa](screenshots/real-list-map-desktop.png), [lateral](screenshots/real-evidence-desktop.png), [móvil](screenshots/real-evidence-mobile.png), [mapa móvil real](screenshots/real-point-mobile.png). |
| Progreso veraz y orden estable | Test de etapas persistidas y polling desordenado; incorporación al final y selección intacta | Run real completado: dos eventos guardados; background real: un evento, cuatro páginas leídas. No se simula un proveedor en curso sobre los datos locales. |
| Evidencia sin repetir metadatos, fechas, inglés | Regresiones de enlaces y fechas con zona horaria; E2E de fragmentos/contradicción | [Fragmento real](screenshots/real-fragment-desktop.png): fecha legible y JSON-LD original, método y fuente; textos históricos diferenciados. |
| Detalle técnico secundario | E2E verifica que UUIDs/auditoría están inicialmente cerrados y luego accesibles; reapertura coteja IDs exactos | La primera pantalla real contiene explicación y acciones. IDs y plan completo se consultan bajo Technical details / Comparison technical details. |
| Vacío, cobertura, fallos, ubicación y presupuesto | Casos controlados de proveedor 503, servidor 503/404, WebGL/tiles/estilo, contradicción y ausencia de precio | [Sin soporte pertinente](screenshots/real-insufficient-mobile.png), [sin coincidencias](screenshots/real-empty-filter-mobile.png), [error local real](screenshots/real-missing-run-mobile.png); ciudad/sede privada sin marcador y cotización pendiente en la comparación. |
| Teclado, foco, etiquetas, marcadores | Enter sobre marcador, Escape, foco restituido, tabulación contenida; símbolos/etiquetas además de color | CUA/Chrome confirmó selección con Enter, cierre con Escape, foco de vuelta a Inspect evidence/Review quote requirements; ≈ y “Approximate location” en el punto real. |
| Revisión desktop y móvil | 1366×900 y 390×844 en E2E, sin desborde horizontal | [Comparación móvil](screenshots/real-comparison-mobile.png), [tarjeta móvil](screenshots/real-comparison-card-mobile.png), [validación de decisión](screenshots/real-decision-validation-mobile.png). En móvil se desplaza la lista normal para leer tarjetas; la auditoría está cerrada. |

## Verificación automatizada

**339 pruebas de funciones/integración aprobadas, sin skips. 42 casos de navegador distintos aprobados (47 resultados contando los cinco tests contenedores).** ESLint y build de producción con comprobación TypeScript aprobados. Los logs conservan también intentos fallidos anteriores; las filas siguientes identifican los cortes aprobados, no suman reintentos como casos nuevos.

| Suite | Resultados incluyendo contenedor | Corte aprobado |
| --- | ---: | --- |
| Funciones/integración | 339 | [final-regression.log](final-regression.log), [ejecución](final-regression.json) |
| Brief DP-03 y dashboard/organizadores | 12 | [brief-and-organizers-final.log](brief-and-organizers-final.log) |
| Discovery Exa, comparación DP-07 y persistencia bajo fallos | 1 + 1 + 5 | Raíces aprobadas de [e2e-matrix.log](e2e-matrix.log); las otras raíces fallidas se corrigieron y verificaron en los cortes siguientes. |
| Relaciones, reapertura de decisiones y lectura completa | 1 + 9 + 1 | Raíces aprobadas de [e2e-corrected.log](e2e-corrected.log); su único fallo fue un selector duplicado de preguntas, ya corregido en el corte final de brief. |
| Mapa DP-09 y experiencia DP-10 | 10 + 7 | [map-experience-final.log](map-experience-final.log), [ejecución](map-experience-final.json) |
| Calidad y producción | Sin errores | [lint-accepted.json](lint-accepted.json), [build-accepted.json](build-accepted.json) |

Se adaptaron los selectores de los recorridos previos al inglés y a la apertura explícita de la auditoría. Se conservaron sus verificaciones de RLS, idempotencia, reinicios, consumo, revisiones originales y decisiones. Los hallazgos funcionales corregidos durante QA incluyen dos landmarks `main` anidados, una referencia equivocada al antecedente, el contexto de un brief histórico, el popup recortado y un indicador de carga después de 404. Se agregó regresión de identidad del antecedente y de carga tras fallo. Las nuevas capturas controladas tienen prefijo `experience-`; otras capturas controladas provienen de las suites previas.

## Chrome con datos reales en localhost:3000

Recorrido asistido por CUA sobre la sesión local de Chrome; sin interceptar respuestas de la app ni sustituir sus fuentes:

1. [Comparación v5](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0): AIT frente a Agent Arena, USD 20.000 y objetivo feedback provisional. Leer prioridad, antecedente y costo pendiente; abrir editor, evidencia y fragmento; volver con Escape; pasar a Events y mantener selección al alternar lista/mapa. Dos eventos, cero puntos justificados.
2. [AI Security Hackathon](http://localhost:3000/?run=fda043a0-ae92-4809-b150-d0d71c62b1d8): un evento y un punto aproximado en 501 Folsom. Selección por teclado, expediente y apertura efectiva de [hackathons.team](https://www.hackathons.team/events/ai-security-hackathon-2026). Mapa y fuente sirvieron contenido real.
3. [Brief de pagos/contratación](http://localhost:3000/?run=6086a9fd-0fdc-4d6b-a810-6aa4dc567a64): mensaje de evidencia pertinente insuficiente. Filtro sin coincidencias y recuperación sobre resultados reales; run inexistente local devuelve error con reintento, sin afirmar carga continua.
4. En móvil se abrió Record decision y se intentó guardar sin motivos: validación visible, sin crear decisión. Se canceló. La creación/edición persistida de briefs y decisiones se verificó en la DB aislada para conservar la demo local.

[Registro resumido](real-browser.json). Las caídas 503/WebGL y contradicciones controladas prueban la presentación de esos estados en Chrome de producción; **no se afirma que un proveedor externo real haya sufrido una caída durante esta revisión**. Los snapshots reales existentes, sus precios desconocidos y sus límites de cobertura sí se inspeccionaron en localhost.

## Entorno y conservación

- DB/worker/E2E: contenedor propio `growthx-dp10-verification`, PostgreSQL 17 en **127.0.0.1:55460**, migraciones 001–010. El runner elimina variables de proveedores antes de ejecutar. No se usó la cola de 54329 para pruebas.
- Builds: copia propia registrada en [production-path.txt](production-path.txt), independiente de `.next` de la app. [run-isolated.py](run-isolated.py) permite preparar, sincronizar y repetir comandos. Los E2E que necesitan Next dev crean su propio directorio temporal a partir de esa copia; otros usan su build de producción.
- Local: DB existente `growthx-postgres` en 54329, Next PID 70986 en 3000 y worker watch PID 70979. HTTP 200 de app y ambos módulos MapLibre 6.9.0; migraciones 001–010 ya aplicadas. No hubo migración adicional, reseed, cambio de claves ni reinicio compartido: hot reload incorporó la UI. [Servicios](local-services.json).
- [Auditoría local](local-preservation.json): **cero filas previas modificadas o faltantes en 13 tablas**. Ninguna escritura de negocio de esta tarea en localhost. Se preservaron asimismo incorporaciones concurrentes observadas durante el trabajo; no se atribuyen a las pruebas DP-10. [Auditor reproducible](audit-local.py).
- [Preflight](preflight.json) registra hashes y estado del árbol al comenzar; [manifiesto de cierre](verified-files.json) identifica cambios de esta entrega respecto de ese corte. No se borraron archivos previos ni se restituyeron versiones desde HEAD.
- Sin commit, push, despliegue ni mensajes externos. El contenedor de verificación se detiene al cerrar, conservando sus datos; la app local sigue disponible.

Para repetir: arrancar el contenedor propio, ejecutar `python3 DemoPuentes/evidence/DP-10/run-isolated.py sync`, luego pasar al runner un nombre de evidencia y el comando (`pnpm lint`, `pnpm build`, `node --test --test-concurrency=1 --test-force-exit 'tests/**/*.test.ts'` o cada suite E2E). Ejecutar DB/worker/E2E secuencialmente; nunca reemplazar las URLs aisladas con 54329. Para una copia nueva usar `prepare` y aplicar migraciones allí antes de probar.

## Límites y siguiente trabajo

No quedan criterios abiertos de DP-10. Siguen pendientes los alcances de **DP-11** (brief accionable/resultado durable) y **DP-12** (aceptación global y preparación de demo), además de cotizaciones, disponibilidad, permisos y validación comercial con los organizadores. La lectura real de AIT conserva sus restricciones de acceso/cobertura de proyectos; no acredita un crawl completo de páginas bloqueadas. Gemini no es requisito para leer esta comparación y no se hizo una llamada real al modelo. La cobertura del catálogo sigue incluyendo material sintético etiquetado de trabajos anteriores; nunca se usa como prueba real en esta matriz.
