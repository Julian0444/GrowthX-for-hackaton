# DP-03 — Brief operativo y contratos compartidos

Verificación: 10 de septiembre de 2026. Alcance: DP-03. La referencia de DP-01 se usa para comprobar representación y atribución; estas pruebas no ejecutan discovery ni vuelven a certificar la vigencia de las páginas.

## Preparación y dependencia

Se leyeron completos el ticket, spec y plan. Del producto se consultaron brief, preguntas, progreso, oportunidades/mapa, dossier, relaciones, comparación, presupuesto, investigación y consumo. DP-01 figura `verified` y se contrastó con su [matriz](../dp-01-verificacion.md), [caso](../dp-01-caso-y-fuentes.md) y [soporte por afirmación](../dp-01-afirmaciones.md). Conserva tres futuras SF y antecedentes con roles distintos; esto acredita la dependencia documental, no disponibilidad comercial.

Se registró el árbol previo mediante hashes en `/tmp/dp03-initial-worktree.json`. Los documentos y evidencia previos de DP-01/02 se conservaron. Los archivos de seguimiento compartidos se actualizaron de forma acotada. No se ejecutaron commit, push, despliegue ni mensajes externos.

## Resultado y aceptación

| Criterio | Resultado comprobado | Evidencia ejecutable |
| --- | --- | --- |
| Brief editable completo | Producto, audiencia/segmentos, objetivo provisional/declarado, éxito opcional, importe/moneda, fechas locales, SF, formatos, restricciones y comparables. Preview con preguntas específicas. | `research-brief.spec.ts`: UI a 1366×900 y 390×844; `research-brief.test.ts` de contratos. |
| Revisión persistida sin descartar declaraciones | v1 de observabilidad/adopción/USD y v2 de pagos/contratación/EUR; éxito/restricciones permanecen. Relectura en conexión nueva y recarga de navegador. v1 permanece intacta. | Integración y E2E DP-03. |
| Estados y fallos honestos | Parsers para investigación, hallazgo y obtención parcial/error/insuficiente. `terminal` distingue parcial terminado del trabajo en curso. Una investigación sin catálogo ya no devuelve fixtures, incluso en la entrada anterior sin `researchScope`. | Contratos DP-03; integración DP-03; regresión de worker `evaluation-run`. |
| Identidad/revisión compartida | Lista, marcador y dossier exponen el mismo par editionId/editionRevisionId. `selectedEditionId` y revisión viven en el estado compartido del dashboard. Comparación y navegación de sus ediciones usan revisiones del snapshot. | E2E DP-03 tarjeta→pin→dossier; test de snapshot frente a revisión nueva y revisión ausente. |
| Ubicación sin precisión inventada | Dirección estructurada, coordenadas opcionales, precisión, método, proveedor, fecha, fuentes, estado y límite. Un decodificador común conserva `unknown` en v1 anterior; ciudad, conflicto o falta de soporte no generan punto. | Contratos DP-03, regresión UI announced/confirmed/contradicted, E2E de mapa. |
| Relaciones por edición y fragmento | Organizador, sponsor sin pago inferido, presentador, venue partner y proyecto publicado; referencias a fuentes/fragmentos y claims de esa edición. Premio y herramienta son claims separados. | Referencia controlada A03/A08/A09/E-AIT; round trip real de PostgreSQL; rechazo de fragmento inexistente, fuente y empresa ajenas. |
| Costo operativo separado | `ResearchBriefInput.budget` es comercial; `ResearchPlan.providerLimits` y `ProviderConsumption` son operativos. Consumo known/unknown, moneda e identidad de operación/run explícitos. Cambiar USD 5.000 por otro importe/moneda no cambia cupos. | Parsers y test de independencia; HTTP rechaza cupos o tenant en el brief. |
| Enmienda de dirección | ADR v1.3 vigente al comenzar; v1.2 identificada como histórica. Web central, mapa integrado, misma infraestructura durable. Glosario actualizado. | [ADR](../../../docs/adr/0001-arquitectura-agente-growth-atlas.md), [CONTEXT](../../../CONTEXT.md). |

## Frontera para los tickets siguientes

- `EvaluationProfile` sigue siendo el brief versionado. `ResearchBriefInput` reemplaza las formas duplicadas del intake HTTP/cliente. Omitir confirmación/éxito conserva el comportamiento provisional/pendiente anterior; declararlos los preserva. `confirmed` en el objetivo significa **declarado por el comprador**, no viabilidad validada.
- `ResearchPlan` se guarda en `runs.input.researchPlan`, con profileId/profileVersion y preguntas generadas por `lib/research/brief-plan.ts`. Se revalida al leer; registros antiguos sin plan devuelven `null`, sin reconstruir historia usando lógica nueva.
- `SourceRecord` admite requestedUrl/canonicalUrl/title/fragments/retrieval; `ClaimRevision.evidence` identifica fragmento o localizador concreto. `SourceRecord.url`, contenido y campos existentes siguen válidos.
- `EventEditionRevision.publicLocation` extiende la edición, manteniendo `coordinates` como único par de coordenadas. `decodePublicLocation` y `projectEditionPosition` son la lectura común. La ausencia de metadatos no se interpreta como venue; no se reescriben revisiones antiguas.
- `EditionRelationship` vive dentro de la revisión de edición. Organizadores/empresas referencian identidades del tenant; proyectos conservan ID, nombre y URL específicos. Sus atributos se representan con claims de edición `project:<id>:<atributo>` y se enlazan por claimRevisionIds. No se añadió otro tipo de ClaimSubject ni un grafo genérico. Sponsor genérico no significa sponsor pagado.
- `ResearchProgress` y `ProviderConsumption` son contratos runtime para DP-04/05. El worker actual conserva sus estados técnicos y pasos durables existentes; `completed` de un job no certifica cobertura. Los nuevos productores de hallazgos/consumo y la reserva agregada por proveedor se integran en esos tickets. No se publican registros ficticios de progreso o gasto para aparentar esa integración.
- Exa y Apify se guardan **deshabilitados**, con límite por run de cero solicitudes/gasto. Esto es un cupo, no consumo medido. Los USD 10/15 del plan siguen siendo topes de la iniciativa: no se copian a cada run. Otros proveedores deberán tener su propio registro y cupo. No se consultaron proveedores pagos durante esta implementación.

## Persistencia y compatibilidad

Las extensiones usan el JSONB versionado existente: `profiles.payload`, `runs.input`, `sources.payload`, `claim_revisions.payload` y `edition_revisions.payload`. No hace falta migración SQL ni reescritura de datos. Cambiaron juntos parsers, upserts, lectores y adaptadores. Las referencias de fuente/fragmento/empresa/organizador se resuelven con RLS; los claims de relación deben pertenecer a su edición. Los nuevos metadatos también se incluyen al reconstruir bundles de snapshot.

Las lecturas de snapshots ordenan de forma estable los registros por ID: se detectó que el orden físico de PostgreSQL podía cambiar el bundle al reabrir, aunque los IDs fueran iguales. El orden de presentación de alternativas sigue siendo el fijado por el snapshot.

## Comprobaciones y evidencia

- [tests.json](tests.json) / [tests.log](tests.log): suite de funciones e integración sobre PostgreSQL aislado; **245 aprobadas, 0 omitidas**.
- [e2e.json](e2e.json) / [e2e.log](e2e.log): **26 comprobaciones aprobadas, 0 omitidas**, en cuatro suites con navegador, Next y worker reales, incluyendo el nuevo brief. El log conserva los resultados por suite (11 + 9 + 5 + 1).
- [typecheck.json](typecheck.json), [lint.json](lint.json) y [build.json](build.json): TypeScript, ESLint de archivos afectados y build de producción.
- [verified-files.json](verified-files.json): archivos modificados y hashes, correspondencia del código con el build y auditoría de conservación del árbol inicial.
- Capturas revisadas: [preguntas v1](screenshots/brief-review-v1.png), [preguntas v2](screenshots/brief-review-v2.png), [ancho reducido](screenshots/brief-mobile.png), [selección compartida](screenshots/brief-selection.png).
- Smoke de `http://localhost:3000` mediante navegador: formulario nuevo visible. Esa sesión de navegador no estaba autenticada, por lo que el guardado se probó con las sesiones del E2E, sin modificar la base del usuario.

Entorno: contenedor propio `growthx-dp03-verification`, PostgreSQL 17 en `127.0.0.1:55443`; las suites no dependen del servidor/worker de la persona. Next de E2E y build corren sobre copias temporales. Al terminar se detuvo únicamente ese contenedor de pruebas, conservando sus datos (`docker start growthx-dp03-verification` para reutilizarlo); los procesos de la app del usuario no se tocaron. `run-check.py` limpia claves externas del entorno y registra comando, salida y código. Para reproducir, iniciar un cluster de prueba con los usuarios dev en ese puerto y ejecutar desde el repo:

```sh
python3 DemoPuentes/evidence/DP-03/run-check.py tests node --test 'tests/**/*.test.ts'
python3 DemoPuentes/evidence/DP-03/run-check.py e2e pnpm test:e2e
```

Ejecutar suites de DB/E2E secuencialmente. El build se hizo en una copia con dependencias copiadas: Turbopack rechaza un symlink de node_modules fuera de su raíz. El intento previo de build con symlink falló por esa restricción, no por código; el build final pasó. El primer E2E de caída falló al clicar navegación antes de la hidratación; se corrigió la espera de disponibilidad del dashboard y se volvió a ejecutar el recorrido. Los logs finales reflejan las comprobaciones efectivas, no se considera suficiente que exista un test.

## Límites y continuación

El formulario y el guardado funcionan ahora. Discovery Exa, lectura completa/Apify, enriquecimiento automático de relaciones y generación de razones comerciales siguen DP-04/05/06/07. El contrato de progreso/consumo está definido y validado; su escritura por esos proveedores, cuotas agregadas y metering siguen pendientes de esas integraciones. El mapa sigue siendo la cuadrícula actual, con la nueva política de precisión; resolver direcciones y reemplazarla por calles corresponde a DP-08/09. La selección compartida no incorpora aún URL/filtrado móvil del nuevo mapa de DP-09/10.

El fixture de catálogo declara precisión únicamente para su sede sintética usada en regresiones; no se promocionó ninguna coordenada de la DB existente. Nuevas importaciones que aún no suministran precisión permanecen sin pin hasta DP-08. La referencia documental de relaciones se serializó solo en el cluster de pruebas y no se presenta como investigación web ejecutada. La aceptación integrada y validación comercial siguen en DP-12 y trabajo posterior.
