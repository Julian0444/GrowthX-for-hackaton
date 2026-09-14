# DP-07 — Comparación y recomendación explicable

Implementación y evidencia del 10/09/2026. El resultado prioriza qué investigar, conserva la elegibilidad de DP-02 y no calcula un ranking de inversión. La lectura `research-comparison/1` queda guardada con el snapshot; los snapshots anteriores siguen siendo legibles sin reconstruir su historia.

## Resultado y alcance

- Cada alternativa muestra pertinencia para el producto/audiencia/objetivo, antecedente con identidad y rol por edición, modalidad publicada y actividad propuesta etiquetada, calidad de soporte, costo/pendientes y siguiente pregunta.
- Las exclusiones de fecha, ciudad y presupuesto se aplican antes de priorizar. Restricciones libres y formatos solicitados quedan como condiciones explícitas hasta verificarse. Premios, créditos, marcas, cantidad de proyectos y entrada gratis no prueban precio de patrocinio ni retorno.
- La afinidad temática usa vocabulario acotado y stack declarado; no reutiliza una inferencia del comprador de otra investigación. Una diferencia factual de antecedentes puede priorizar investigación; empate conserva comparación sin orden de inversión; falta de soporte produce una pregunta útil.
- El editor crea una nueva revisión del perfil y otro run vinculado. Guarda diferencias de brief, elegibilidad, condiciones, pertinencia, actividad y evidencia; la interfaz las muestra como texto legible.
- Los antecedentes incluyen revisiones exactas de ediciones históricas, claims, organizadores, relaciones y fuentes. Abrir un dossier o expediente desde la comparación usa ese bundle, sin sustituirlo por el catálogo actual.
- La redacción opcional usa `comparison-narrative/3`: el modelo selecciona claims admitidos por alternativa; el servidor publica únicamente su composición factual. Rechaza citas inexistentes/ajenas, retiene cifras no respaldadas y descarta cambios de autoridad. Una caída o clave ausente conserva la explicación determinística.

## Dependencias comprobadas

| Dependencia | Evidencia y contrato reutilizado |
| --- | --- |
| DP-02 — verified | [Matriz](../DP-02/README.md), `claim-support`, `costs`, `eligibility` y reglas de decisión existentes. Los costos aditivos completos excluyen; monedas mixtas, cifras contradictorias y partidas pendientes no se convierten a cero. |
| DP-03 — verified | [Evidencia](../DP-03/README.md), `ResearchBriefInput`, validador estricto, revisión del perfil, tenant/idempotencia y estados de evidencia/ciudad. |
| DP-06 — verified | [Matriz](../DP-06/README.md), `readOrganizerDossier`, relaciones por edición y fuentes con fragmentos. Sponsor en París no se transforma en organizador de SF. |

Se leyeron ticket completo, Execution y Comments, spec y plan; se consultaron producto y handoff. El índice conservaba estados históricos: la decisión de avanzar se contrastó con estos contratos, tickets y pruebas. [Preflight](preflight.json) registra el árbol y hashes previos. Handoff e índice no se editaron durante el trabajo paralelo; sus hashes siguen idénticos en [archivos verificados](verified-files.json).

## Matriz de aceptación

| Criterio | Comprobación |
| --- | --- |
| 1. Razón, antecedente, modalidad, costo y pregunta por alternativa | `tests/acceptance/explicable-comparison.test.ts`, E2E de selección de dos ediciones, [comparación desktop](screenshots/comparison-desktop.png), [antecedente real](screenshots/local-antecedent.png). |
| 2. Elegibilidad previa y condiciones materiales | Costos aditivos/múltiples monedas/contradicción; presupuesto; restricciones libres y formatos. Integración y E2E verifican exclusión antes de priorizar; [ventana real](screenshots/local-window.png). Decisión condicional/reapertura cubiertas por las suites existentes. |
| 3. Prioridad factual versionada, sin ranking comercial | AIT frente a Vultr, orden de entrada invertido, soporte afirmativo, comparación sin base de orden; [prioridad real](screenshots/local-priority.png). |
| 4. Redacción sobre evidencia admitida | Integración con transporte de modelo controlado: citas ajenas/inexistentes, precios/éxito inventados, intento de score/eligibilidad y caída. En localhost se comprobó fallback por `GEMINI_API_KEY` ausente; no se afirma una llamada real a Gemini. |
| 5. Cambios crean otra evaluación; original inmutable | Integración + E2E: producto, audiencia, objetivo, presupuesto, moneda, restricciones, stack y fechas; compara bundle original byte a byte tras nuevas revisiones y cambios del catálogo. [Diferencias reales](screenshots/local-differences.png), [exportación real](local-real.json). |
| 6. Ciudad pendiente sigue condicional, sin punto ficticio | Test de aceptación con ciudad/audiencia ausentes y coordinates=null. Reutiliza política DP-02 y consumidor compartido de mapa DP-09. No se marca confirmada SF. |
| 7. Sin soporte suficiente | Brief de pagos/contratación frente a los mismos eventos: mensaje de insuficiencia y pregunta sobre programa/audiencia; no se completan recomendaciones artificiales. Controlado y localhost. |
| 8. Snapshot con revisiones exactas | Integración y exportación SQL: refs de ediciones/relaciones/claims/fuentes fijadas, nuevo catálogo no cambia bundle anterior, RLS y rollback. E2E abre el dossier histórico con la revisión guardada. |

## Verificación aislada

Next/worker y build en `/tmp/growthx-dp07-production`; PostgreSQL propio `growthx-dp07-verification`, puerto **55447**. El [runner](run-check.py) elimina variables de proveedores y configura únicamente esa DB. No se usó la base de localhost para ejecutar suites, migraciones de prueba ni builds.

- [Regresión](regression-final.json), [log](regression-final.log): **334/334** pruebas unitarias, contratos, conectores, integración y UI; sin skips. El único fallo previo fue una expectativa antigua de versión de prompt, corregida a `/3`.
- [Corte final focalizado](final-focused.json), [log](final-focused.log): **12/12**, después del ajuste final de etiquetas de modalidad/propuesta.
- [Browser final DP-07](browser-final.json), [log](browser-final.log): **1/1**, PostgreSQL + worker + build de producción, selección de dos, fragmentos, dossier histórico fijado, editor, diferencias, ventana excluyente, stack vacío, reapertura inmutable, sin errores JS y móvil sin desborde horizontal.
- [Build](build.json), [log](build.log); [lint](lint.json), [log](lint.log); [TypeScript](typecheck.json).
- **30/30 E2E comprobados en los cortes finales**: 17 casos aprobados en la regresión existente, 12/12 en [mapa/brief corregidos](e2e-map-resolved.json) ([log](e2e-map-resolved.log)) y 1/1 DP-07. Los dos fallos de mapa de intentos anteriores quedaron resueltos.
- [Regresión E2E](e2e-regression.json), [log](e2e-regression.log), y [primer intento conjunto](e2e-final.log) conservan todos los resultados, incluidos los fallos de harness de mapa detectados durante DP-09. Su corrección coordinada usa Chrome instalado y proveedor/estilo controlados en los tests que necesitan WebGL; no modifica los criterios de comparación.

Los transportes HTML/modelo y fuentes sintéticas de tests se identifican como tales. Las capturas `comparison-*` son controladas; `local-*` corresponden a fuentes reales previamente admitidas en la app. No se simula disponibilidad de Gemini ni se acredita retorno comercial con fixtures.

## Localhost y conservación

Se coordinó con DP-09 el arranque del contenedor existente `growthx-postgres`, que estaba detenido. [Activación](local-activation.json): sin migraciones nuevas, cambios de claves, reinicio de datos ni reemplazo de servicios. Se conservó un backup privado fuera del repositorio. Next en 3000 y worker en watch recuperaron conexión.

Se crearon seis comparaciones locales, cuatro revisiones nuevas del brief y seis snapshots; se dejó nuevamente activo el contenido original del brief como revisión v5. Las revisiones de prueba también se conservan. [Auditoría](local-preservation.json): **cero filas anteriores modificadas o faltantes** en las 13 tablas verificadas. Las 152 decisiones, 100 campañas, 779 fuentes y todas las revisiones de claims/ediciones/organizaciones anteriores permanecen idénticas. [Script reproducible](audit-local.py).

[Exportación local](local-real.json) y [script de lectura](export-local.py) contienen las seis evaluaciones, hash de cada snapshot, referencias, perfiles, condiciones y lectura. Cada snapshot coincide con el resultado publicado originalmente en su run.

Recorrido comprobado:

1. Eventos → seleccionar **Agents, Everywhere: Bots, Channels, & More — Global Hackathon** y **The Agent Arena Hackathon** → Comparar seleccionadas.
2. AI Tinkerers queda primero para investigar por Secure Agents Buildathon y su programa publicado sobre monitoring/auditing/recovery de agentes. Google Cloud conserva sponsor anunciado; Wordware, venue anunciado. Vultr conserva sponsor reportado en París. Ambos eventos actuales siguen condicionados por cotización de patrocinio desconocida.
3. Editar a pagos/contratación, EUR 200 y restricciones opt-in/no comprar listas elimina el soporte pertinente. Cambiar ventana a 20/09–30/10 excluye AIT por fecha 12/09. Las diferencias quedan guardadas.
4. Reabrir la comparación anterior recupera la prioridad y el snapshot originales. Volver al contenido original del brief restaura la prioridad en otra revisión, sin borrar ninguna evaluación.

Enlaces para la misma sesión local:

- [Comparación final — brief original, v5](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0).
- [Comparación original reabierta](http://localhost:3000/?run=f759e1bc-d191-4e8d-8e6d-935d326c3592).
- [Cambio de producto y restricciones](http://localhost:3000/?run=6086a9fd-0fdc-4d6b-a810-6aa4dc567a64).
- [Cambio de ventana y exclusión](http://localhost:3000/?run=28d1cdef-ed88-433a-b648-958f0fceb874).

Las cuatro fuentes seleccionadas se obtuvieron previamente el 10/09, entre 22:41 y 22:42 UTC; DP-07 las reutilizó sin nuevas consultas externas: Cerebral Valley, blog de Vultr, página actual de AI Tinkerers y Secure Agents Buildathon. El catálogo general conserva también material sintético etiquetado de otras pruebas; no se seleccionó para esta demostración real.

## Archivos y compatibilidad

- Contrato aditivo: `lib/contracts/comparison.ts`, `evaluation.ts`, `evaluation-validation.ts`. `decisionReading` y `sourceIds` son opcionales para snapshots históricos; sin migración SQL.
- Evaluación: `lib/server/evaluations/{decision-reading,compare,eligibility,model-adapter,snapshot-store,service,wire}.ts`.
- Consumidores: `lib/api/{atlas-client,opportunity-adapter}.ts`; `components/research-dashboard/{comparison-panel,comparison-reading,comparison-brief-editor,comparison-differences,research-dashboard}.tsx`; CSS propio `comparison-reading.css`.
- Pruebas: fixture comparison, aceptación/integración/E2E explicable-comparison, expectativa de prompt de evaluation-snapshot y script E2E en package.json.
- Se preservó integración concurrente de DP-09 en research-dashboard/ResearchEvents. Ajuste aditivo del fixture compartido sf-map: decision/campaign null; anotación de this en el test WebGL de sf-street-map para el typecheck estricto, coordinada con DP-09. Sin editar globals.css, mapa, handoff ni índice por DP-07. Los demás cambios preexistentes/concurrentes no se atribuyen a esta entrega.

## Límites y seguimiento

No hay cotización ni permiso comercial confirmado para las dos opciones reales; no se recomienda comprometer gasto. El modelo real sigue opcional y sin clave local; sus fronteras se verificaron con transporte controlado. La regla temática es explícita, acotada y versionada: no promete comprensión universal, audiencia efectiva, éxito ni ROI. DP-09 conserva su propio cierre del mapa. El cierre documental conjunto de handoff/índice debe hacerse una vez terminado el paralelo, según la instrucción del usuario. No se hicieron commits, push, despliegues ni mensajes externos.
