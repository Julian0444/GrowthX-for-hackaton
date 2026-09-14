# DP-06 — Identidad, antecedentes y relaciones con evidencia

Implementación y verificación del 10 de septiembre de 2026. El comprador usado en las pruebas es ilustrativo. Se distinguen explícitamente transporte controlado, obtención HTTP real y reapertura de evidencia persistida.

## Resultado observable

En **Eventos**, después de guardar un brief, el panel **Who is behind this event?** permite investigar una URL admitida. **Research organizer & projects** inicia un run durable; **Open background dossier** abre su resultado. También se puede iniciar desde una propuesta de discovery: se conserva el ID de la propuesta y su run original.

El dossier muestra pertinencia para el producto/objetivo, próximo paso, identidad atribuida, audiencia anunciada frente a asistencia desconocida, condiciones pendientes y relaciones con fragmentos. Desde el organizador se navega a las ediciones anteriores, incluso fuera de SF, y desde allí a la empresa o al proyecto publicado. El historial diferencia organizar, alojar y patrocinar; no hay puntuación de reputación ni inferencia de ROI.

## Dependencias contrastadas antes de editar

- DP-03: [contratos](../DP-03/README.md), `SourceRecord`, fragmentos y `ClaimRevision`; relaciones dentro de `EventEditionRevision`. Atributos de proyectos vinculados al sujeto edición. RLS y revisiones inmutables se mantienen.
- DP-04: ticket y [evidencia](../DP-04/README.md) verificados contra `discovery/durable.ts`, plan de queries y fuentes propuestas persistidas. Sus queries de antecedentes aportan URLs candidatas; sus snippets no respaldan claims de DP-06.
- DP-05: ticket y [frontera de integración](../DP-05/README.md), `readProposedSource`, `readKnownSource` y `cachedSourceRead` contrastados con código. La lectura completa tiene un SourceRecord distinto del snippet. Se reutilizan allowlist, HTTP seguro, extracción, cache y presupuestos existentes.
- DP-01: [organizadores](../dp-01-organizadores.md), R12–R15 del [caso](../dp-01-caso-y-fuentes.md) y [registro por afirmación](../dp-01-afirmaciones.md). AIT tiene antecedente organizando; Vultr tiene antecedente patrocinando en París. Premio, tecnología declarada y eficacia son afirmaciones diferentes.
- Se leyeron completos ticket, spec e implementation-plan y las secciones pertinentes de finalProduct/PuentesHandoff. Los tickets/evidencia de DP-04/05 prevalecen sobre estados antiguos del plan/handoff.

## Criterios y pruebas

| Criterio | Implementación y comprobación |
|---|---|
| Organizer/coorganizer/calendar/venue/sponsor separados | Roles explícitos. `Hosted By`, `Presented by` y `Featured in` no son equivalentes. Un calendario no entra en `organizerIds`. Tests de calendario/host/coorganizer y presenter sin sponsor. |
| Empresa–edición–rol–fuente | Relaciones con alcance, estado, sourceIds, fragments y claimRevisionIds. Logo no implica paid_sponsor; pago y retorno comercial siguen pendientes. AIT/Google Cloud y Vultr/París comprobados con fuentes reales. |
| Proyecto en la edición correcta y tecnología con soporte | Enlace explícito de la edición a su galería más backlink del proyecto a esa misma galería. Repo aislado o galería de otro año no sirven. Premio separado de `Products & Tools`; enlace público y repo declarado se conservan sin ejecutar código. |
| Identidades sin fusiones por nombre/ciudad/año | Ancla pública exacta; sin ancla, identidad limitada a su fuente. Edición por URL canónica y año. Enriquecer una importación Luma reutiliza identidad y cadena de claims; otro año crea otra edición. Homónimos y URLs sin vínculo no se fusionan. |
| Pertinencia para el comprador | Claim `buyer:relevance` inferido, con soporte histórico y propuesta de actividad condicionada. AIT: programa anunciado de monitoring/auditing/recovery. Vultr: experiencia de patrocinio, sin atribuir organización local. Contacto, acceso, costos, audiencia real y resultados quedan pendientes. |
| Cobertura revisada, sin extrapolación | Número de páginas de proyectos efectivamente vinculadas y leídas; total de galería solo si fue obtenido. Muestra parcial nunca equivale a asistentes. Lecturas fallidas no se transforman en proyectos. |
| Revisiones/RLS/grants | Transacción de aceptación+cola; replay y recuperación; append-only; evidencia ajena o claim de otra edición revierte la transacción. Worker inserta identidades/revisiones; cola no tiene permisos de negocio. Refresh preserva evidencia y ubicación previa. |
| Dossier real con antecedente útil y soporte | Dos recorridos completos AIT y Vultr con HTTP real y Chromium visible. Reapertura posterior en build final sin worker ni nueva obtención. Fragmentos de Google Cloud y patrocinio en París accesibles desde el dossier. |

## Evidencia real y sus límites

[real-browser.json](real-browser.json) guarda IDs, fuentes, fechas de obtención, hashes, fragmentos, cobertura y limitaciones de los runs reales. [real-browser-verified.log](real-browser-verified.log) registra el recorrido exitoso con Next de producción, PostgreSQL, cola, worker y Chromium visible.

1. **AI Tinkerers SF**: evento actual → identidad del capítulo → Secure Agents Buildathon, 6/12/2025 → Google Cloud, sponsor anunciado → fragmento de agradecimiento. El programa anterior anunciado incluye monitoring, auditing y recovery de agentes; el dossier propone explorar integración/feedback y explicita que ejecución, asistencia y adopción no fueron observadas.
2. **Vultr**: host actual en SF → expediente → hackathon de RAISE 2025 en París → patrocinio reportado por Vultr, organizado por lablab.ai. El antecedente no se presenta como experiencia de organizar en SF ni como oportunidad local.

En el run real final de AIT se obtuvieron **2 páginas de 6 intentadas**. Galería, Citadel, Cleo y directorio de organizadores devolvieron **403**. Por eso ese dossier no inventa proyectos ni un responsable operativo. El recorrido real se completa por la empresa y el programa histórico. Vultr obtuvo sus 2 páginas.

Una descarga HTTP real anterior sí obtuvo Citadel: [real-project-reading.json](real-project-reading.json) conserva fecha original, hash y el vínculo edición → galería ← proyecto, premio, tecnología declarada y repo. Es una comprobación separada de extracción sobre esa descarga, **no** una nueva obtención ni un seed del run de navegador. No prueba disponibilidad posterior, eficacia del proyecto ni asistencia.

[controlled-browser.json](controlled-browser.json) y capturas `controlled-*` verifican el camino completo con dos proyectos y los casos negativos mediante HTML controlado explícitamente sintético, usando DB, cola, worker y navegador reales. No se usan como prueba factual del evento.

[reopened-real.json](reopened-real.json) y capturas `reopened-*` verifican las dos lecturas reales guardadas en el build final: mismos IDs/revisiones, fragmentos y lecturas persistidas, sin worker, cero nuevas obtenciones y sin desbordamiento en móvil. Las capturas finales desactivan la animación de entrada solo al fotografiar; algunas capturas iniciales `real-*` muestran esa transición.

## Verificación ejecutada

- [regression-verified.log](regression-verified.log): **309 tests, 309 pass**, cero fallos/skips. Incluye 11 tests de extracción/contratos DP-06 y el grupo de integración DP-06 con 10 subcasos: atomicidad, recuperación, límite temporal, failed proposal en su run original, RLS, refresh, Vultr, discovery→lectura, referencias inválidas e importación Luma/año distinto.
- [e2e-regression.log](e2e-regression.log): **29 tests** en 7 archivos, todos pasan. Recorridos anteriores de organizadores, decisiones reabiertas, persistencia/caídas, brief, discovery, lectura y DP-06. Datos controlados; cero proveedores pagados.
- Build final, TypeScript y lint: resultados enlazados en `verified-files.json`. El E2E controlado final usa ese build aislado.
- [real-browser-verified.log](real-browser-verified.log): HTTP real y recorrido visible AIT+Vultr. La reapertura final usa los datos de ese mismo run, sin volver a consumir fuentes.
- Se conservan los logs de iteraciones fallidas para trazabilidad. Los archivos de resultados finales indicados arriba y en `verified-files.json` son los de cierre.

El test de integración concurrente de DP-08, `tests/integration/location-resolution.test.ts`, exige la DB de su propia sesión y rechaza 55446. Se lo excluyó explícitamente en [run-regressions.py](run-regressions.py), sin redirigirlo ni alterar ese test. El intento amplio previo y su rechazo quedan en `regression.log`. Esto no certifica la verificación específica de DP-08.

## Presupuestos, persistencia e integración concurrente

- Máximo **6 URLs** por investigación y **90 segundos** de plazo persistido; cache DP-05 de hasta 5 minutos, fetchedAt original y stale fallback explícito. Las lecturas ya comprometidas se recuperan aun después del plazo; los fallos del mismo run no disparan requests repetidos.
- **0 llamadas Exa y 0 Apify adicionales** desde DP-06. Se aprovechan propuestas existentes y enlaces públicos. Las URLs revisadas de DP-01 son pistas, nunca hechos precargados ni fallback sintético. Los parsers son conservadores para las fuentes admitidas; una fuente no reconocida puede quedar insuficiente.
- No se fusionan cross-listings por título ni perfiles por empleador/ciudad. Ampliar fuentes o confirmar aliases requiere evidencia adicional, no una heurística de similitud.
- Migración propia `009-dp06-relationships.sql`: únicamente INSERT de empresas/organizadores/revisiones para worker. FORCE RLS existente se mantiene; sin UPDATE/DELETE de evidencia ni grants de negocio a cola.
- La sesión de DP-08 agregó geocodificación y revisiones de ubicación durante el trabajo. Se conservaron sus cambios en contratos, store/read, worker y dossier; se probó la cadena conjunta de revisiones, sin configurar proveedor geográfico. Se aplicó también `010-location-resolution.sql` en la DB propia porque el código concurrente la requiere.
- No se detectó edición simultánea incompatible. No se reemplazaron archivos compartidos por versiones previas. `preflight.json` registra el estado inicial; plan, índice y handoff mantienen sus hashes iniciales.
- Para integrar al entorno compartido queda aplicar migraciones pendientes en orden y reiniciar Next/worker con los cambios combinados. **No se aplicaron migraciones, cambiaron datos ni reiniciaron servicios de localhost:3000 / PostgreSQL 54329.**

## Entorno aislado y reproducción

DB PostgreSQL 17: contenedor `growthx-dp06-verification`, puerto **55446**. Build: `/tmp/growthx-dp06-production`, copia sin `.env*` ni `.next` compartido. Cada prueba de navegador crea su propio Next en un puerto libre y su propio worker; al terminar los cierra. [run-check.py](run-check.py) construye un entorno limpio con URLs de los roles de la DB propia y no carga credenciales de proveedores. Sus contraseñas locales son exclusivamente las de desarrollo del contenedor desechable.

Desde la raíz del repositorio, con ese contenedor disponible:

```sh
docker start growthx-dp06-verification
python3 DemoPuentes/evidence/DP-06/run-check.py migrate-local node lib/server/db/migrate.ts
python3 DemoPuentes/evidence/DP-06/run-check.py regression-local python3 ../DemoPuentes/evidence/DP-06/run-regressions.py
DP06_PRODUCTION_DIR=/tmp/growthx-dp06-production python3 DemoPuentes/evidence/DP-06/run-check.py browser-local node --test tests/e2e/relationships.spec.ts
```

La última orden requiere el build de producción propio ya compilado. Sin `DP06_PRODUCTION_DIR`, el E2E crea y cierra una copia de Next dev aislada. `DP06_REAL_SMOKE=1` selecciona fuentes públicas reales y Chromium visible; una fuente puede cambiar o rechazar lectura. `scripts/verify-background-reopen.ts` vuelve a mostrar los runs reales registrados sin worker ni nuevas consultas, mientras se conserve la DB propia.

Para probar manualmente en una app ya integrada: guardar brief → Eventos → pegar URL de AIT actual o Vultr → Research organizer & projects → Open background dossier → organizador → edición anterior → Evidence for this edition and role. También funciona el botón de investigación en cada propuesta admitida de discovery. París se abre como antecedente, fuera del mapa de oportunidades SF.

No se hicieron commits, push, despliegues ni mensajes externos. No se editaron handoff ni índice compartido.


## Integración local posterior — 10/09/2026

Con autorización explícita del usuario, se aplicaron 008–010 en 54329, se configuró Census y se reiniciaron app/worker de localhost:3000. Se conservaron todas las filas anteriores. La integración conjunta pasó 318 pruebas y 29 E2E aislados, build, TypeScript y lint. Dirección geocodificada, ciudad sin pin, coordenadas de fuente y reapertura histórica comprobadas en la sesión local del usuario. Organizador/antecedente/empresa comprobados en vivo; las páginas de proyectos AIT devolvieron 403, por lo que su recorrido completo se acredita solo con pruebas controladas. [Evidencia conjunta y enlaces para abrir los resultados](../local-integration-DP05-DP06-DP08/README.md). Esta actualización sustituye los pendientes de migración/configuración local del cierre original; no cambia la procedencia de sus pruebas anteriores.
