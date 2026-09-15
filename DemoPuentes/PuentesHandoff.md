# Puentes — Handoff

## Estado vigente: documentación para reviewers — 14/09/2026

**DP-01–11 conservan sus cierres históricos `verified`; DP-12 está `in-progress`, según su [ticket](issues/12-aceptacion-real-y-demo-puentes.md).** La entrega pública se describe en el [README principal](../README.md), con [verificación actual](../docs/verification.md) y [limitaciones conocidas](../docs/known-limitations.md). Esta revisión cambia documentación, no código de aplicación; las nuevas pruebas y el build se realizaron en un entorno aislado. Sus resultados, incluida una comprobación de navegador incompleta, se registran en la verificación: no constituyen una nueva aprobación integral de DP-01–11 ni el cierre de DP-12.

La aceptación global y la revisión del video final siguen pendientes. El [guion](demo-script.md) existe, pero sus enlaces precargados requieren sesión y sus fechas describen investigaciones históricas. No asumir que un evento sigue siendo futuro ni que los servicios locales mantienen su estado anterior. **Este corte prevalece sobre todas las menciones históricas a DP-12 `pending`, servicios activos y próximos pasos de las secciones inferiores**, conservadas como registro de las entregas.

## Corte histórico: DP-11 verificado — 10/09/2026

**DP-01 a DP-11 están verified; DP-12 sigue pending.** Este corte sustituye las indicaciones de estado de todos los bloques históricos inferiores. [Ticket DP-11](issues/11-brief-decision-y-reapertura.md), [matriz y recorridos](evidence/DP-11/README.md), [plan/índice](implementation-plan.md). La aceptación global de la demo sigue siendo DP-12.

DP-11 completa **Explore first / Choose / Discard / Leave pending**, motivos, objetivo/responsable/modalidad/preguntas/costos del brief, respuestas atribuidas y copia del brief/mensaje manual. Explorar usa participación pendiente más `intent: explore_first`; la propuesta no acredita una oferta. Las transacciones y revisiones existentes se conservan. Los enlaces nuevos fijan `revision=N`; los viejos sin esa parte leen la última. El índice usa el nombre de la edición del snapshot; evidencias, relaciones y mapa históricos no toman silenciosamente el catálogo actual.

**Comprobaciones registradas en el cierre de implementación:** 349 resultados de funciones/integración y **29 casos distintos de navegador / 33 resultados con contenedores**, todos aprobados sin skips; build/TypeScript, ESLint y diff check correctos. [Resumen final](evidence/DP-11/verification-summary.json). Las suites ejecutan Chrome/app de producción, PostgreSQL y worker propios, incluido reinicio de Next, caída del worker, tenant ajeno, 409/503, cuatro decisiones, resolución atribuida, clipboard completo/denegación y cambio de nombre/coordenadas del catálogo. No se suman reintentos como casos distintos.

**Chrome real en localhost:** se guardó un brief QA de explorar AIT y una decisión pendiente Security. En dos pestañas, A guardó revisión 2; B conservó texto y responsable tras el conflicto, releyó explícitamente y guardó revisión 3. La revisión 1 reabierta conserva exactamente su clipboard de 4036 caracteres. Se verificaron laptop 1366×900, móvil 390×844 y editor sin desborde. Una actualización explícita de Security leyó cuatro páginas reales y creó otra edición; el dossier y pin históricos permanecieron en su revisión. La sede real conservó sus coordenadas; el caso con desplazamiento está comprobado en la DB aislada. [Registro real](evidence/DP-11/real-browser.json), [payloads](evidence/DP-11/local-evidence.json), [capturas](evidence/DP-11/screenshots/).

Para probar: abrir el [brief revisión 3](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0&decision=af10470d-6902-4faf-a87a-75aa511265c4&revision=3&view=campaign), **Copiar borrador manual** y pegar/cotejar con la vista previa; **Volver a la comparación → Edit decision & brief** o **Mark resolved**. No resolver costos reales con datos inventados. El [brief original revisión 1](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0&decision=af10470d-6902-4faf-a87a-75aa511265c4&revision=1&view=campaign) conserva su texto anterior. [Security histórico](http://localhost:3000/?run=683695df-b761-432c-9839-fb2a11f6a8f8) → **Inspect evidence** o **Explore this comparison in list & map → Map** conserva revisión y ubicación. El clipboard requiere foco de pestaña; una denegación se informa, sin toast falso de éxito.

**Entorno y datos:** pruebas aisladas en `growthx-dp11-verification` **55461**, detenido al cierre sin borrar datos; build propio registrado en [production-path](evidence/DP-11/production-path.txt). [Runner](evidence/DP-11/run-isolated.py) sin `.env.local` ni claves; [limpieza](evidence/DP-11/cleanup.json). DB local `growthx-postgres` **54329**, Next **3000** y worker watch activos al cierre. [Servicios](evidence/DP-11/local-services.json). DP-11 no necesita migración/configuración nueva, reseed ni reinicio manual; 001–010 ya estaban aplicadas y watch cargó cambios. Comprobar identidad/estado antes de una operación futura.

[Auditoría](evidence/DP-11/local-preservation.json): **cero filas previas modificadas o faltantes en 13 tablas**. Se agregaron dos runs, un snapshot/narrativa, cuatro revisiones de decisión, tres campañas y nuevas revisiones/fuentes de la actualización. Se conservaron todos los datos previos y una ampliación concurrente del handoff DP-10, reproducida debajo. [Manifiesto de archivos](evidence/DP-11/verified-files.json). No hubo commit, push, despliegue ni mensajes externos.

**Qué sigue:** DP-12 (aceptación real integral, ensayo, guion). Cotizaciones, disponibilidad, audiencia y acceso siguen siendo preguntas comerciales, no bloqueos técnicos pendientes de DP-11. El resumen exhaustivo de cambios de fuentes y el monitoreo posterior quedan fuera de este ticket. La evidencia distingue fixtures/control de fallos de páginas reales; las resoluciones/ofertas de QA no son acuerdos reales. Conservar todos los cambios existentes y reutilizar los contratos al continuar.

### Traspaso de esta conversación y siguiente recorrido

Se aplica la skill [handoff](../.agents/skills/handoff/SKILL.md) en la ruta explícita solicitada por el usuario, que prevalece sobre su destino temporal por defecto. Este pedido actualiza solamente este documento: no vuelve a ejecutar pruebas, investigaciones, builds ni reinicios. El [manifiesto DP-11](evidence/DP-11/verified-files.json) corresponde al cierre anterior a esta actualización del handoff; su hash de este archivo ya no representa esta versión.

El usuario recibió el cierre DP-11 verified y ahora pide un caso completo para **cargar una empresa nueva desde el formulario y ver los resultados**. Todavía no confirmó haberlo realizado. El caso de abajo es una entrada ficticia propuesta para su prueba manual; no se creó un perfil ni se lanzó una investigación nueva en este pedido. El próximo agente debe acompañar ese recorrido si el usuario lo solicita, sin presentar los resultados de AIT/Security guardados anteriormente como resultados de esta nueva empresa. Evidencia, archivos y verificaciones de implementación: consultar la [matriz DP-11](evidence/DP-11/README.md), sin repetirlos ni reconstruirlos desde cero.

### Caso de uso: RastroAI busca feedback técnico en San Francisco

**Empresa ficticia:** RastroAI ofrece observabilidad para agentes de IA. Su equipo quiere encontrar una oportunidad para proponer un workshop práctico y obtener feedback del SDK, con un presupuesto máximo de USD 5000. Las cantidades de éxito son metas del comprador, no resultados prometidos.

Abrir **http://localhost:3000/** sin parámetros `run`, `decision` ni `revision`, y entrar a **Brief** o **Start research**. Así se inicia el formulario nuevo, en vez de editar el perfil de una evaluación guardada. El formulario no tiene un campo independiente para el nombre de la empresa: incluirlo en Product.

| Campo de la app | Valor para copiar |
| --- | --- |
| Product | RastroAI: plataforma de observabilidad para agentes de inteligencia artificial. Nuestro SDK permite registrar trazas, detectar fallos y comparar evaluaciones en aplicaciones construidas con Python y TypeScript. |
| Audience | Ingenieros de IA, desarrolladores backend y equipos que construyen agentes para empresas. |
| Audience segments | AI engineers, backend developers, developer tools founders |
| Stack and topics | Python, TypeScript, AI agents, observability, evaluations, debugging |
| Participation budget / Currency | 5000 / USD |
| From / To | 2026-09-11 / 2026-12-31 |
| What is your goal? | Technical feedback |
| Goal status | Declared by me |
| Definition of success | Que 10 desarrolladores prueben el SDK y obtener 3 entrevistas de feedback técnico sobre trazas y evaluaciones. |
| City | San Francisco |
| Formats | technical workshop, hackathon, office hours |
| Constraints — una por línea | Necesitamos una actividad práctica para desarrolladores. / No comprometer gasto sin cotización completa. / Confirmar que se permite proponer un workshop. |
| Companies you have in mind | Dejar vacío para este caso. Es una referencia a comparables/competidores, no el nombre de RastroAI. |

**Recorrido esperado según la implementación actual:**

1. **Review brief → Confirm and research SF**. Se guarda el perfil y se inicia discovery; la app abre Organizers y muestra progreso persistido. Los límites de consultas del proveedor se mantienen separados de los USD 5000 comerciales.
2. Primero aparecen páginas **Source candidate · reading pending** con título, fragmento y procedencia. No son todavía oportunidades validadas ni una recomendación final. La cantidad y nombres dependen de la búsqueda real; también puede aparecer cobertura insuficiente o un fallo explícito.
3. Elegir una página pertinente y pulsar **Research organizer & projects**. Cuando termine, abrir **Open background dossier** y revisar edición/fecha, antecedentes, rol del organizador, fragmentos y condiciones. Desde Events consultar la lista y Map: sólo las ubicaciones con soporte suficiente generan un punto. Un evento sin venue público puede ser útil y permanecer únicamente en la lista.
4. En Events marcar **Compare** en el evento leído (o hasta tres alternativas) y pulsar **Compare selected**. En Decisions leer **What to investigate first**, **Inspect evidence** y **Background, proposed activity and cost**. Usar los hallazgos realmente publicados; no suponer que hay workshop disponible o que entrada gratuita significa patrocinio gratuito.
5. En el candidato que valga la pena investigar, **Record decision → Explore first**. Motivo de ejemplo, condicionado a la evidencia leída: «Quiero validar si este evento permite un workshop de depuración de agentes. Antes de elegir, necesito confirmar audiencia, formato y costo completo». Completar objetivo «Obtener feedback técnico del SDK», responsable «Equipo DevRel», modalidad **Workshop**, **Team proposal · not offered** y detalle «Laboratorio práctico de trazas y evaluación de agentes con Python/TypeScript».
6. Agregar preguntas: «¿Aceptan un workshop de 45 minutos?», «¿Qué perfiles técnicos esperan?» y «¿Cuál es el costo completo y qué incluye?». Si se agrega una partida, usar «Participación/workshop» con **Pending amount**, soporte «Por confirmar con el organizador»; mantener las partidas originales. **Save decision** conserva todo con sus condiciones y abre el borrador.
7. **Copiar borrador manual**: pegar en un editor y comparar con **Copied text preview**. Copiar **Enlace interno**, cerrar la pestaña y reabrirlo: debe conservar el mismo brief y revisión. **Edit decision & brief** o **Mark resolved** crea una revisión nueva; resolver sólo con una respuesta auténtica y su atribución/soporte. Guardar/copiar no envía ni reserva nada.

**Resultado útil de este caso:** un brief de actividad propuesta, respaldado por lo que se pudo leer y con preguntas concretas antes de invertir. La comprobación manual pendiente consiste en que el usuario ejecute esta nueva entrada y evalúe los hallazgos; no se garantiza un evento específico ni una oferta comercial. Si discovery falla, registrar el mensaje y diagnosticarlo sin sustituirlo silenciosamente por el catálogo anterior. Para repetir sólo el tramo DP-11 ya comprobado, usar los enlaces a las revisiones 1 y 3 incluidos arriba.

### Suggested skills

- [handoff](../.agents/skills/handoff/SKILL.md): actualizar este traspaso después del recorrido del usuario, referenciando tickets y evidencia.
- [diagnosing-bugs](../.agents/skills/diagnosing-bugs/SKILL.md): si el formulario, discovery, lectura, comparación o guardado falla; identificar primero el estado y run afectados.
- [research](../.agents/skills/research/SKILL.md): si el siguiente pedido requiere investigar o contrastar nuevas fuentes para la aceptación DP-12; separar la evidencia publicada de las metas del caso ficticio.

## Corte anterior: DP-10 verificado — 10/09/2026

**DP-01 a DP-10 están verified; DP-11/12 siguen pending.** Este bloque sustituye el estado de los cortes históricos inferiores. El [plan/índice](implementation-plan.md) quedó consolidado con los cierres que ya existían de DP-05–09 y con el nuevo cierre DP-10. No se aprueba todavía la aceptación global de la demo.

DP-10 reúne brief compacto editable, oportunidades, mapa y evidencia. Las tarjetas priorizan nombre, fecha, razón, pendiente y acciones; comparación y mapa reutilizan las revisiones guardadas. El expediente lateral conserva contexto en desktop; móvil alterna lista/mapa y abre evidencia completa, con foco contenido y retorno al control original. La auditoría queda desplegable. Los textos principales están en inglés; citas y contenido histórico conservan su idioma. La explicación del brief de la comparación está separada de las hipótesis con las que se leyeron antes las fuentes. [Ticket y cierre](issues/10-experiencia-investigacion-y-evidencia.md), [matriz y evidencia](evidence/DP-10/README.md).

**Verificación registrada en el cierre de implementación:** 339 pruebas de funciones/integración, 42 casos de navegador distintos aprobados (47 resultados con contenedores), sin skips; build/TypeScript y lint correctos. La contabilidad corresponde a los cortes aprobados detallados en el [resumen de verificación](evidence/DP-10/verification-summary.json), no a una nueva ejecución durante este handoff. Chrome real en localhost a 1366×900 y 390×844: lectura de comparación, editor, lista/mapa, punto aproximado de Census, fuente pública, fragmento, validación, falta de soporte, teclado/foco y error/reintento. Los estados 503, WebGL, cartografía y contradicción también se verificaron con transporte controlado en el entorno aislado. No confundir esas fallas inducidas con un incidente real del proveedor.

Para probar: abrir la [comparación AIT/Vultr con brief v5](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0), leer **What to investigate first**, abrir **Inspect evidence** y **Background, proposed activity and cost**, o pasar a **Explore this comparison in list & map**. **Edit brief** reutiliza la edición versionada existente. Para un marcador real: [AI Security Hackathon](http://localhost:3000/?run=fda043a0-ae92-4809-b150-d0d71c62b1d8) → **Events → Map**. El símbolo ≈ identifica la precisión aproximada; ciudad sola o sede privada siguen sin punto.

**Conservación y entorno:** pruebas/worker/E2E en `growthx-dp10-verification` (**55460**) y builds en una copia propia registrada en evidence/DP-10. Contenedor propio detenido al cierre, sin eliminar sus datos ni dejar procesos de prueba propios: [limpieza](evidence/DP-10/cleanup.json). Para reproducir las pruebas, consultar la matriz y el [runner aislado](evidence/DP-10/run-isolated.py); la ruta del build está en [production-path.txt](evidence/DP-10/production-path.txt). Al cierre de implementación, DB local `growthx-postgres` en 54329, Next en 3000 y worker watch estaban activos. Verificar disponibilidad e identidad de los procesos antes de una operación posterior; este resumen no vuelve a certificar su estado en vivo. Migraciones 001–010 ya aplicadas; DP-10 no necesitó SQL, reseed ni reinicio local. [Auditoría](evidence/DP-10/local-preservation.json): cero filas previas modificadas o faltantes en 13 tablas; se conservaron también incorporaciones concurrentes. Ninguna escritura de negocio de esta tarea en localhost. [Servicios](evidence/DP-10/local-services.json), [archivos del cierre](evidence/DP-10/verified-files.json).

No quedan criterios abiertos de DP-10. **Pendientes:** alcance propio de DP-11 y DP-12; cotizaciones, disponibilidad y permisos comerciales; límites de acceso a páginas/proyectos de las fuentes reales. No se inventó evidencia para completarlos. La comparación funciona sin una llamada real a Gemini. Conservar los cambios del árbol y estos contratos al continuar. Sin commit, push, despliegues ni mensajes externos.

### Traspaso de esta conversación

Se usa la skill [handoff](../.agents/skills/handoff/SKILL.md) en la ruta explícita del usuario, que prevalece sobre su indicación de guardar en el directorio temporal. Este pedido actualiza únicamente este documento y conserva íntegros los cortes históricos inferiores. No se reejecutaron pruebas, builds, investigaciones ni servicios. El manifiesto de archivos enlazado describe el cierre anterior a esta actualización autorizada; su hash del handoff no representa esta nueva versión.

El usuario recibió el cierre **DP-10 verified, 8/8 criterios**, el recorrido de localhost y los límites pendientes. No confirmó haber completado personalmente el recorrido. La evidencia enlazada distingue las acciones reales en Chrome de las pruebas controladas: en localhost se abrió el editor y se comprobó la validación de acciones sin guardar cambios de negocio; la persistencia de edición del brief y decisiones se verificó en el entorno aislado.

### Continuación recomendada

Seguir el próximo pedido del usuario; este traspaso no inicia DP-11 ni DP-12. Antes de implementar el siguiente ticket, leerlo completo, incluidos Execution y Comments, junto con [spec](spec.md), [plan](implementation-plan.md), las secciones pertinentes de [producto](finalProduct.md) y los cierres, evidencia y código de sus dependencias. El contraste DP-03/07/09 de esta sesión está registrado en la [matriz DP-10](evidence/DP-10/README.md).

Conservar los cambios existentes y concurrentes del árbol. Reutilizar los snapshots inmutables de comparación, la selección compartida lista/mapa/evidencia y el contrato geográfico que decide qué ubicaciones admiten un punto. No reconstruir una comparación histórica con el catálogo o brief actuales. Las hipótesis de lectura de una fuente y el brief de la comparación son contextos distintos; la interfaz ahora lo explicita. Consultar la matriz para archivos y contratos, sin rehacer la implementación desde las notas históricas.

Para nuevas pruebas de DB/worker/E2E, usar un entorno aislado y un directorio propio de build, preservando la DB local y sus datos. Mantener la distinción entre fallas inducidas y proveedores reales, y comprobar la vigencia de las fuentes antes de una demo futura. Continúa vigente la instrucción de no hacer commit, push, despliegues ni enviar mensajes externos.

### Suggested skills

- [redesign-existing-projects](../.agents/skills/redesign-existing-projects/SKILL.md): se utilizó en DP-10; aplicar si el próximo pedido modifica la experiencia visual existente, conservando sus contratos funcionales.
- [diagnosing-bugs](../.agents/skills/diagnosing-bugs/SKILL.md): aplicar si aparece un fallo reproducible durante el siguiente recorrido o implementación.
- [handoff](../.agents/skills/handoff/SKILL.md): usar para actualizar este traspaso cuando el usuario lo solicite, referenciando los cierres en lugar de duplicarlos.


## Corte anterior: comparación DP-07 y mapa DP-09 verificados — 10/09/2026

**DP-01 a DP-09 figuran `verified` en sus tickets; DP-10/11/12 siguen `pending`.** Esta actualización incorpora la conversación de DP-07 y conserva íntegro el resumen concurrente de DP-09 que otra sesión agregó mientras se preparaba este documento. Las menciones históricas inferiores a comparación/mapa pendientes quedan sustituidas por estos dos cierres. El [plan/índice](implementation-plan.md) todavía requiere consolidación; no se editó en este pedido.

Se usa la skill [handoff](../.agents/skills/handoff/SKILL.md), en la ubicación explícita del usuario, que prevalece sobre su indicación de guardar en el directorio temporal. **Este pedido modifica únicamente el handoff**: se consultaron tickets, evidencia y estado del repositorio, sin reejecutar pruebas, builds, investigaciones ni servicios. Los hashes protegidos de los manifiestos anteriores describen el corte previo a esta actualización autorizada, no el hash actual de este documento.

### Entrega de la conversación DP-07

El [ticket DP-07](issues/07-comparacion-y-recomendacion-explicable.md) quedó **verified, 8/8 criterios**, con Execution, Comments y [evidencia](evidence/DP-07/README.md) actualizados. La comparación de hasta tres ediciones explica pertinencia para el comprador, antecedente, modalidad publicada o actividad propuesta, calidad del soporte, costo/condiciones y siguiente pregunta. La elegibilidad de DP-02 precede a la prioridad de investigación; cuando falta soporte se declara, sin fabricar un ranking comercial ni completar tres recomendaciones.

Editar el brief crea otra revisión del perfil y otro run vinculado, con diferencias legibles; el snapshot original permanece inmutable. Antecedentes, relaciones, claims y fuentes quedan fijados por revisión. Abrir un dossier u organizador desde una comparación usa ese bundle histórico. Reutilizar los contratos aditivos y consumidores ya integrados con DP-09; no reconstruir snapshots anteriores con la política actual. Implementación, versión de lectura y archivos: [matriz DP-07](evidence/DP-07/README.md#archivos-y-compatibilidad) y [manifiesto de cierre](evidence/DP-07/verified-files.json).

**Verificación registrada:** 334 pruebas de regresión, 12 checks finales focalizados y 30 E2E distintos comprobados en los cortes finales; build, TypeScript y lint aprobados, lint sin advertencias. Se comprobaron restricciones, costos, ciudad pendiente sin punto, evidencia contradictoria, citas inválidas/ajenas, cifras inventadas, modelo ausente, RLS, idempotencia y reapertura inmutable. Los fallos previos del harness WebGL se resolvieron coordinadamente con DP-09 usando Chrome instalado y cartografía controlada. [Resumen de resultados y contabilidad E2E](evidence/DP-07/verification-summary.json). Estas cifras no son una nueva ejecución durante este resumen.

**Demostración real en localhost:** AIT actual frente a The Agent Arena/Vultr, reutilizando cuatro fuentes reales ya admitidas, sin nuevas consultas externas. Secure Agents Buildathon y su programa de monitoring/auditing/recovery justifican investigar AIT primero para el brief de agentes/observabilidad. Vultr conserva su antecedente como sponsor reportado en París; no se le atribuye organización. Ambos eventos actuales mantienen pendiente la cotización de patrocinio. La publicación de antecedentes no acredita pago, ejecución, asistentes ni retorno.

Cambiar a pagos/contratación, EUR 200 y restricciones opt-in/no comprar listas produce falta de soporte pertinente. Mover el inicio de la ventana al 20/09 excluye AIT por fecha 12/09. Se reabrió la comparación anterior con su snapshot original y se dejó activo nuevamente el contenido inicial del brief como **nueva revisión v5**, conservando las revisiones de prueba. [Exportación de las seis evaluaciones](evidence/DP-07/local-real.json), [recorrido de navegador](evidence/DP-07/local-browser.json) y [captura de antecedente](evidence/DP-07/screenshots/local-antecedent.png).

### Lo explicado al usuario y cómo ver DP-07

El usuario pidió una explicación sencilla. Se explicó que la página ahora ayuda a entender **qué evento investigar primero y por qué**, permite abrir el respaldo del antecedente y cambiar el brief sin perder la comparación anterior. Se aclaró que todavía faltan precios y permisos antes de invertir. Recibió estas instrucciones; no confirmó haber completado personalmente el recorrido:

1. Abrir la [comparación final con brief original v5](http://localhost:3000/?run=4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0), usando la sesión local existente de Chrome.
2. Leer **Qué investigar primero**; bajar a AI Tinkerers y abrir **Ver evidencia de antecedente**.
3. Abrir **Editar brief y comparar de nuevo**, cambiar un dato y guardar. La nueva evaluación muestra **Qué cambió frente a la evaluación anterior**.
4. Ejemplos ya guardados: [cambio de producto/restricciones](http://localhost:3000/?run=6086a9fd-0fdc-4d6b-a810-6aa4dc567a64), [ventana y exclusión](http://localhost:3000/?run=28d1cdef-ed88-433a-b648-958f0fceb874) y [comparación original reabierta](http://localhost:3000/?run=f759e1bc-d191-4e8d-8e6d-935d326c3592).

Reabrir esos enlaces no inicia otra investigación. El catálogo general conserva material sintético etiquetado de pruebas anteriores; no se seleccionó como evidencia real de esta demostración. Mantener la distinción entre prueba controlada y fuentes reales, y comprobar vigencia antes de una demo futura.

### Entorno, conservación y pendientes de DP-07

Se coordinó con DP-09 el arranque del contenedor local existente, encontrado detenido. No hubo nuevas migraciones, cambios de claves, reseed ni reemplazo de app/worker; Next y worker watch recuperaron conexión. Backup privado fuera del repositorio. [Activación](evidence/DP-07/local-activation.json). La integración anterior 008–010 y Census ya está documentada en el bloque DP-05/06/08; no volver a aplicarla por sus notas históricas.

La [auditoría](evidence/DP-07/local-preservation.json) registró **cero filas anteriores modificadas o faltantes en 13 tablas**. Se agregaron seis comparaciones/snapshots y cuatro revisiones del perfil; las 152 decisiones, 100 campañas, 779 fuentes y todas las revisiones previas permanecieron idénticas. El último cierre de DP-07 dejó la DB del usuario `growthx-postgres` en 54329 activa, app en 3000 y worker watch. Verificar disponibilidad e identidad de procesos antes de una operación posterior; este resumen no vuelve a certificar su estado en vivo.

Pruebas/build de DP-07: copia `/tmp/growthx-dp07-production`, PostgreSQL propio `growthx-dp07-verification` en **55447**; procesos de prueba cerrados y contenedor detenido conservando datos. [Runner y reproducción](evidence/DP-07/README.md#verificación-aislada). La frase recibida desde otra sesión sobre ese contenedor aún activo era anterior al cierre de DP-07; no confundirlo con la DB compartida ni arrancarlo para una lectura del handoff.

No quedan criterios pendientes de DP-07. Sí siguen pendientes cotizaciones/permisos comerciales reales y, opcionalmente, activar Gemini: su frontera se probó con transporte controlado, pero en localhost faltaba `GEMINI_API_KEY` y funcionó la explicación determinística. No se afirma una llamada real a Gemini ni se necesita una clave para abrir esta comparación. DP-10/11/12 conservan su alcance y la aceptación global no queda aprobada por estos cierres.

Antes de continuar, seguir el próximo pedido del usuario y leer ticket completo, [spec](spec.md), [plan](implementation-plan.md), secciones pertinentes de [producto](finalProduct.md), evidencia de Blocked by y código actual. Preservar todos los cambios previos/concurrentes. Este pedido autoriza editar el handoff, no el índice ni servicios; no se hicieron commit, push, despliegues ni mensajes externos.

## Cierre concurrente: DP-09 implementado y verificado — 10/09/2026

**DP-09 quedó `Execution: verified`, con sus nueve criterios comprobados.** El mapa de cuadrícula fue reemplazado por calles reales de SF, conectado a la lista y al dossier de cada evento. El [ticket](issues/09-mapa-sf-integrado.md) conserva Execution y Comments; la [matriz DP-09](evidence/DP-09/README.md) contiene alcance, archivos, configuración, comandos, capturas y límites. El [resumen de verificación](evidence/DP-09/verification-summary.json) y el [manifiesto de archivos](evidence/DP-09/verified-files.json) documentan el corte de cierre, no certifican cambios posteriores del árbol.

Para continuar, conservar la frontera ya integrada: DP-08 decide qué ubicación puede mostrarse y con qué precisión; DP-09 representa el conjunto filtrado y las revisiones del run. Lista, pin y dossier comparten identidad y selección; las comparaciones históricas usan su snapshot y el catálogo actual se abre expresamente como otra vista. Los cambios concurrentes de DP-07 se reutilizaron, incluidos antecedentes y razones de comparación, sin conflicto incompatible. No crear otra fuente de verdad geográfica ni volver a incluir todo el catálogo en un run. La matriz enlazada explica estos contratos y sus consumidores.

**Verificación del cierre:** regresión y E2E aprobados, mapa probado en builds de producción Turbopack y webpack, TypeScript y lint correctos. Se verificó Chrome real en desktop y móvil, tanto con proveedores controlados para errores/interacciones como con HTTP, Census y cartografía reales. También se comprobó localhost:3000 con investigaciones existentes. Los resultados, cifras y distinción entre evidencia real y fixtures están en el resumen y la matriz; no se reejecutaron pruebas para redactar este handoff. Esto no equivale a un despliegue remoto ni demuestra retorno comercial.

### Lo explicado al usuario y cómo verlo

El usuario pidió una explicación sencilla. Se explicó que ahora puede seleccionar un evento, verlo sobre calles reales y abrir desde el marcador su ficha y las fuentes. Una ubicación aproximada se identifica como tal; los eventos sin dirección siguen en la lista. Se indicó este recorrido: [abrir AI Security Hackathon](http://localhost:3000/?run=fda043a0-ae92-4809-b150-d0d71c62b1d8) → **Eventos → Ver en mapa → Abrir dossier**. En móvil se alterna **Lista / Mapa**, y **Encuadrar resultados** recupera el área después de explorar. El usuario recibió estas instrucciones; no confirmó haber completado personalmente el recorrido. Los ejemplos sin punto e históricos están enlazados en la matriz DP-09.

### Entorno y siguiente sesión

Al cierre de DP-09, localhost, DB y worker compartidos estaban activos y sus datos conservados. DP-09 activó los assets del mapa sin migraciones, reseed ni escrituras en la DB local; la reactivación del contenedor existente se coordinó con DP-07. El entorno de pruebas propio, `growthx-dp09-verification` en **55459**, quedó detenido con sus datos conservados. El smoke real usa una base separada de la regresión: no juntarlas al repetir pruebas. Estado y reproducción en [servicios locales](evidence/DP-09/local-services.json) y la matriz. Verificar nuevamente procesos y disponibilidad antes de operar; este resumen no hizo comprobaciones nuevas de servicios.

DP-09 no tiene criterios pendientes. DP-10/11/12 conservan su alcance de integración general y aceptación de la demo; leer sus tickets y dependencias antes de empezar. Para el estado final de la sesión independiente DP-07, consultar su ticket y evidencia: esta conversación solo acredita la integración compatible que utilizó DP-09. La cartografía depende de red/proveedor y tiene fallback a lista comprobado. No repetir consultas pagas ni ampliar presupuestos por este traspaso.

Este pedido autoriza **solo actualizar este handoff** y sustituye la prohibición anterior de editarlo durante el paralelo. Se usa la skill [handoff](../.agents/skills/handoff/SKILL.md), guardando en la ruta explícita del usuario en lugar del directorio temporal sugerido. Se conserva el contenido anterior, no se modifica el índice compartido ni se ejecutan tareas adicionales. Sin commit, push, despliegue, mensajes externos ni credenciales en el documento. Los hashes que describen el handoff intacto en la evidencia DP-09 corresponden al cierre previo a esta actualización autorizada.

## Integración local DP-05/06/08 — corte anterior del 10/09/2026

Desde aquí se conservan los cortes históricos. Las menciones a DP-09 pendiente o al mapa sin calles quedan sustituidas por el estado actual de arriba; otros estados y observaciones deben contrastarse con sus tickets vigentes.

**DP-05, DP-06 y DP-08 están habilitados en localhost:3000.** El usuario autorizó expresamente migraciones, configuración y reinicios. Se aplicaron 008–010 a la DB existente 54329, se agregó `GROWTHX_GEOCODER=us-census` y se reiniciaron Next dev y worker watch. Se mantuvieron claves y presupuestos. App/worker/DB quedan activos. Referencias de PID/log: `/tmp/growthx-local-app.pid`, `/tmp/growthx-local-app.log`, `/tmp/growthx-local-worker.pid`, `/tmp/growthx-local-worker.log`; verificar identidad antes de controlar procesos.

Se creó una copia privada previa fuera del repo. Auditoría de todas las filas anteriores: **ninguna eliminada o modificada**, incluidos 638 runs, 133 snapshots, 152 decisiones y 100 campañas. Cuatro investigaciones nuevas se hicieron desde la sesión existente de Chrome: dirección de Hackathons.team resuelta por Census; Agent Arena en lista sin pin; Luma con coordenadas publicadas sin consulta extra; AIT con organizador, edición anterior y evidencia de Google Cloud. Se reabrió la comparación anterior con la revisión Luma original y su decisión/campaña. No se cargaron fixtures en la DB local.

**Verificaciones conjuntas:** 318 pruebas de funciones/integración y 29 E2E sin fallos/omisiones en DB aislada 55449, build de copia idéntica, TypeScript en árbol local y lint. La regex y el guard de DB pendientes ya estaban corregidos por el cierre final de DP-06; no fue necesario cambiar código de aplicación. Los 59 archivos del conjunto coincidieron con el build. El contenedor aislado se detuvo conservando sus datos.

**Límite real:** cuatro páginas de AIT (galería, dos proyectos y directorio) respondieron 403. El flujo con proyectos completos pasó con transporte controlado aislado; no se afirma extracción real exitosa de proyectos en localhost. Organizador → edición anterior → empresa → fragmento sí funciona con fuentes reales. Una consulta gratuita Census, 13 lecturas HTTP (9 exitosas), cero Exa/Apify. Sin presupuesto ampliado. Calles y puntos superpuestos siguen en DP-09; contratos geográficos listos. Sin commit, push, despliegues ni mensajes externos.

[Evidencia conjunta, resultados y pasos exactos](evidence/local-integration-DP05-DP06-DP08/README.md). Acceso rápido: [dirección resuelta](http://localhost:3000/?run=fda043a0-ae92-4809-b150-d0d71c62b1d8) → Open background dossier → Ubicación pública → Procedencia de ubicación; [AIT](http://localhost:3000/?run=422c3de4-20c0-47a5-8e64-d23e0a8cac58) → Open background dossier → organizador → edición anterior. Usar el Chrome con sesión local existente.

## Contexto histórico previo a esta integración

Las secciones siguientes conservan los cierres anteriores. Sus frases sobre no haber migrado/reiniciado localhost y sobre DP-06/08 pendientes describen ese corte histórico y quedan sustituidas por el estado actual de arriba. El plan/índice aún puede estar desactualizado; no se editó en esta integración.

Actualizado el 10 de septiembre de 2026, America/Los_Angeles, usando la skill [handoff](../.agents/skills/handoff/SKILL.md). Se guarda en la ubicación explícitamente solicitada por el usuario, que prevalece sobre el directorio temporal sugerido por la skill. Conserva el contexto anterior mediante referencias. No contiene credenciales.

## Punto de continuación

**DP-01/02/03/04/05/06 figuran verified en sus tickets.** Este traspaso incorpora la conversación DP-06 y conserva los cierres anteriores de DP-04/05, distinguiendo pruebas controladas y fuentes reales. Para esta actualización se leyeron ticket, evidencia y estado del repositorio; los 29 archivos del manifiesto DP-06 coincidieron con sus hashes de cierre. No se reejecutaron las suites para redactar el resumen. El [plan](implementation-plan.md) todavía muestra DP-05 en progreso y DP-06 pendiente: su índice debe consolidarse con los cierres. El [ticket concurrente DP-08](issues/08-direccion-a-coordenadas.md) también figura verified; aquí se consultó su cierre, sin reauditar su entrega. Este pedido modifica únicamente el handoff.

El usuario quiere saber si la app investiga de verdad y qué utilidad recibe al pegar un evento. DP-04 demostró búsqueda real y persistencia; DP-05 agregó lectura con soporte y DP-06 la conectó con identidad, antecedentes y pertinencia para el brief. **No se comparó el antes/después con el mismo brief ni se demostró retorno comercial.** La comparación/recomendación explicable mantiene su alcance en DP-07; no confundir el expediente de antecedentes con una decisión comercial validada.

Antes de continuar, leer el ticket elegido completo, [spec](spec.md), [plan](implementation-plan.md), secciones pertinentes de [producto](finalProduct.md), evidencia de Blocked by y estado del repositorio. La iniciativa activa usa `DemoPuentes/issues/`; el ticket de geografía de `.scratch/evaluacion-persistida/` mencionado por error anteriormente pertenece a otro tracker.

## Entrega de la conversación DP-04

Se implementó **brief → consultas Exa → páginas propuestas persistidas → reapertura**, sobre PostgreSQL, cola y worker existentes. Se adaptaron contratos, API y dashboard; se agregaron límites agregados, consumo por intento, recuperación tras interrupciones y errores explícitos. Las fuentes de búsqueda no se convierten automáticamente en afirmaciones confirmadas ni eventos/pins. Las investigaciones históricas conservan su recorrido original.

El [ticket DP-04](issues/04-discovery-exa-durable.md) quedó `verified`, con Execution, criterios y Comments actualizados; también se actualizaron índice, README y evidencia. La [matriz de aceptación](evidence/DP-04/README.md) reúne archivos, durabilidad, límites, comandos, capturas y pendientes. El [manifiesto](evidence/DP-04/verified-files.json) corresponde al corte del cierre, previo a cambios posteriores de DP-05 y de este documento; no certifica automáticamente el árbol actual completo.

**Verificación realizada en DP-04:** 262 pruebas de funciones/integración y 27 comprobaciones E2E aprobadas, sin fallos u omisiones; TypeScript, ESLint y build correctos. Incluyó aislamiento entre tenants, deduplicación, límites concurrentes, timeout, falta de key, fallos de proveedor, cierre de pestaña y recuperación tras SIGKILL sin reenviar intentos inciertos. Los logs están enlazados desde la matriz; no se repitieron para este resumen.

El usuario sustituyó la clave anterior de un amigo y confirmó «Ahí la cambié». Después se hizo **una consulta real con su clave**: cinco páginas y USD 0,007 estimados por Exa, con reserva operativa de USD 0,02. Se conservaron [respuesta admitida](evidence/DP-04/real-reference-response.json), [consumo y recuperación](evidence/DP-04/real-smoke.json) y [reapertura en navegador de producción desktop/móvil](evidence/DP-04/real-browser.json). Reanudar no generó otra llamada. El smoke pertenece a una base aislada; no se cargó en el tenant del usuario.

## Lo explicado al usuario sobre DP-04

Para ver DP-04 en [localhost:3000](http://localhost:3000/): recargar, abrir **Perfil**, completar/revisar el brief y pulsar **Revisar interpretación → Confirmar e investigar SF**. Las páginas propuestas quedan guardadas; se reabren desde **Resumen → Investigaciones guardadas**. Hay que iniciar una investigación nueva para probar discovery: los runs anteriores mantienen sus resultados. El usuario recibió estas instrucciones, pero no confirmó haber completado personalmente el recorrido.

Ante «¿probaste investigar algo?, ¿mejoró mucho la respuesta?», se explicó la búsqueda real de hackathons/workshops de SF entre septiembre y octubre para una plataforma de observabilidad de agentes de IA. Aparecieron páginas de Google Cloud, Datadog y TrueFoundry, entre otras. Un fragmento mencionaba **Santa Clara** y otro indicaba **evento pasado**. Esto demuestra la necesidad de leer, comprobar geografía/fecha y evaluar condiciones; la lista no se presentó como recomendación comercial ni como eventos elegibles confirmados.

También preguntó si debía configurar el dashboard de Exa. Se inspeccionaron el código y la [documentación oficial de Search](https://exa.ai/docs/reference/search): usamos **Auto**, hasta tres consultas y cinco resultados por consulta; Deep/Deep-reasoning se seleccionan en la solicitud de la app. Su captura mostraba USD 69,99 de saldo y opciones de facturación. Se aclaró que recargar saldo o aumentar QPS no mejora por sí mismo la relevancia. No se cambió el modo, su cuenta ni se hizo otra consulta real. El saldo procede de esa captura, no de una consulta de facturación; tampoco amplía el cupo operativo de USD 10 acordado para Exa.

La mejora propuesta fue afinar consultas, leer fuentes y comprobar condiciones. Comparar Auto con Deep sería un experimento futuro, todavía no realizado. La respuesta que describía lectura completa como pendiente correspondía al estado conocido antes de revisar el cierre concurrente de DP-05.

## Entrega de la conversación DP-05

El [ticket DP-05](issues/05-lectura-completa-y-apify.md) quedó `verified`, con Execution, criterios y Comments actualizados. Se implementó el lector común de fuentes conocidas, texto visible + JSON-LD, fragmentos por atributo, fechas discrepantes, ubicación pública completa, caché y conservación de evidencia parcial. Se adaptaron importador Luma, worker y dossier para mostrar el respaldo desplegable y distinguir extracción automática de revisión humana. Los contratos DP-03 se reutilizaron sin un cambio incompatible. [Matriz, límites y archivos](evidence/DP-05/README.md) · [manifiesto de los 25 archivos de código/pruebas](evidence/DP-05/verified-files.json).

**Verificación realizada en DP-05:** 279 pruebas de funciones/integración y 28 comprobaciones E2E aprobadas, TypeScript/ESLint/build correctos; se repitieron las nueve comprobaciones propias de integración y el recorrido DP-05 en producción aislada tras los ajustes finales. El [smoke real](evidence/DP-05/real-sources.json) leyó seis fuentes F1–F6 por HTTP; el [recorrido real de Luma](evidence/DP-05/real-browser.json) mostró audiencia, sponsors anunciados, dirección, fragmentos y costo pendiente, conservando IDs al recargar. La discrepancia de fechas se probó con fixture identificada, no se atribuyó a F2. No se cargó este material en la DB del usuario.

Apify quedó como alternativa dirigida y recuperable: runId/estado persistidos, resultado parcial y consumo conocido/desconocido. Se comprobó con respuestas controladas y SIGKILL real después del commit, reanudando sin otro POST. **No se ejecutó un Actor real ni Exa Contents**: la muestra no justificó ese gasto. El cupo de Apify es agregado por instalación, no por sesión/investigación; límites y reserva conservadora están en la [decisión de proveedor](evidence/DP-05/README.md#decisión-de-proveedor-y-consumo). No activarlo solo porque existe una clave ni duplicar el cupo de Exa de DP-04.

## Lo explicado al usuario sobre DP-05

El usuario preguntó si la utilidad era pegar un evento y recibir información. Se confirmó: **un enlace de Luma produce una ficha guardada con lo que publica el evento, el fragmento que respalda cada dato y lo pendiente**, ahorrando recorrer la página buscando audiencia, sponsors, dirección, acceso y programa. Esto prepara información para comparar; todavía no decide si conviene participar o patrocinar.

Para verlo: con sesión y perfil guardado en [localhost:3000](http://localhost:3000/), **Eventos → URL de Luma → Importar → Abrir dossier persistido → Evidence**. Se indicó la fuente F2 para ver Wasmer/TENKI CLOUD, dirección con código postal y costo pendiente; [instrucciones completas y fuente](evidence/DP-05/README.md#cómo-probar-y-frontera-de-integración). El usuario recibió la explicación, pero no confirmó haber realizado el recorrido en su sesión. El camino visible actual es la importación manual; no se presentó como lectura automática de todos los resultados de Exa.

## Entrega de la conversación DP-06

El [ticket DP-06](issues/06-organizador-sponsors-y-proyectos.md) quedó `verified`, con Execution, criterios y Comments actualizados. La entrega convierte una URL admitida o una propuesta seleccionada de discovery en un expediente durable de identidad, ediciones anteriores, empresas y proyectos, con roles y fragmentos. Reutiliza los contratos DP-03 y la frontera de lectura DP-05; no usa snippets como respaldo. Los detalles de implementación, presupuestos, archivos y criterios están en la [matriz DP-06](evidence/DP-06/README.md) y el [manifiesto de cierre](evidence/DP-06/verified-files.json); no reconstruir el lector ni la resolución por recomendaciones antiguas de este handoff.

**Verificación registrada en DP-06:** 309 pruebas de regresión y 29 E2E aprobadas, build de producción, TypeScript y lint correctos; además se repitieron el flujo propio y el de organizadores tras los ajustes finales. El test de integración de DP-08 que exige su DB propia se excluyó explícitamente, sin redirigirlo ni certificarlo como parte de DP-06. Las cifras corresponden al corte documentado, no a una nueva ejecución durante este resumen.

La [verificación real](evidence/DP-06/real-browser.json) recorrió AIT actual → organizador → edición anterior → Google Cloud y programa técnico anunciado, y Vultr host actual → patrocinio reportado en París, organizado por lablab.ai. La [reapertura final](evidence/DP-06/reopened-real.json) conservó IDs, revisiones y fragmentos, sin worker ni nueva obtención. El run final de AIT recibió cuatro 403 para galería, proyectos y directorio: no se inventaron proyectos ni contacto. El [proyecto Citadel leído antes por HTTP](evidence/DP-06/real-project-reading.json) y el [recorrido de proyectos con transporte controlado](evidence/DP-06/controlled-browser.json) son evidencias separadas; no prueban disponibilidad posterior ni eficacia. La matriz explica esta distinción y enlaza las capturas.

## Lo explicado al usuario sobre DP-06

El usuario preguntó «¿qué utilidad tiene?, ¿le pego un evento y me da info?». Se explicó: **sí; ayuda a evaluar si vale la pena explorar participar con su empresa**, mostrando quién organiza, qué hizo antes, qué empresas/proyectos aparecen, por qué puede relacionarse con su producto y qué falta confirmar. Por ejemplo, un antecedente de agentes de IA puede justificar explorar una demo o integración; no demuestra que un patrocinio vaya a producir ventas. Solo funciona con las fuentes admitidas, no con cualquier página de internet.

Recorrido indicado: guardar perfil → **Eventos → Who is behind this event? → URL → Research organizer & projects → Open background dossier → organizador → edición anterior → Evidence for this edition and role**. También existe el botón desde propuestas admitidas de discovery; no se investigan automáticamente todas las páginas de Exa. Se compartió una [captura real del dossier](evidence/DP-06/screenshots/reopened-ait-event.png). El usuario no confirmó haber completado el recorrido en su propia sesión.

Se aclaró que **DP-06 se verificó en una instancia aislada y no activó ni migró los servicios compartidos de localhost:3000**. No prometer que basta con recargar esa página: revisar antes el ledger y el worker actuales. La explicación posterior de utilidad no autorizó modificar esos servicios.

## Siguiente integración

- La selección de una propuesta de discovery ya está conectada a [readProposedSource](../frontend/lib/server/sources/proposed-source.ts) y al workflow DP-06. Conserva tenant/run y separa fuente completa de snippet. La planificación automática de todas las propuestas no se implementó.
- Al cierre quedaba coordinar las migraciones **008-source-reading.sql**, **009-dp06-relationships.sql** y **010-location-resolution.sql** según el ledger real, y reiniciar Next/worker con el código combinado. DP-06 las aplicó solo en su DB propia. La última observación compartida consignada por DP-05 era 001–007; este resumen no volvió a inspeccionar la DB y no convierte esa observación en estado actual.
- DP-08 integró el mismo resolver geográfico en Luma y en el productor de ediciones DP-06. Se preservaron sus cambios compatibles y las revisiones de ubicación. Su nota de cierre sobre el regex `/s` de `relationships.spec.ts` quedó resuelta después: DP-06 usa `[\s\S]` y su TypeScript/build final pasó. Esto no sustituye la revisión de los demás pendientes del ticket DP-08.
- La comparación explicable y el mapa de calles continúan en sus tickets DP-07/09. Antes de una demo nueva, comprobar disponibilidad y vigencia de las fuentes; los 403 no justifican cargar datos controlados como si fueran reales.

No ejecutar estos pendientes por este pedido de resumen. En una tarea posterior, comprobar dependencias con evidencia y preservar los cambios de las entregas concurrentes.

## Contexto anterior que debe preservarse

| Entrega | Referencia y límite relevante |
| --- | --- |
| DP-01 | [Caso y fuentes](evidence/dp-01-caso-y-fuentes.md), [organizadores](evidence/dp-01-organizadores.md), [afirmaciones](evidence/dp-01-afirmaciones.md), [verificación](evidence/dp-01-verificacion.md). Comprador ilustrativo; sin compra, cotización completa ni ROI demostrados. AIT organizó en SF; Vultr patrocinó en París. Conservar ciudad y rol. |
| DP-02 | [Matriz y frontera técnica](evidence/DP-02/README.md). Confianza, costos, condiciones, calendario y evidencia. Las decisiones históricas no se recalculan por una corrección posterior. |
| DP-03 | [Brief, contratos y evidencia](evidence/DP-03/README.md). Revisión del perfil, preguntas, fuentes, relaciones, ubicación, progreso y consumo compartidos. Dependencia comprobada antes de DP-04; no reimplementarlo por recomendaciones antiguas. |

La revisión previa de producto observó exceso de información técnica antes de una respuesta útil y un mapa de cuadrícula sin calles. La jerarquía acordada es respuesta → diferencias materiales → evidencia → detalle técnico. DP-10 aborda la experiencia y DP-09 las calles; no se inició un rediseño aquí. Revisar vigencia de fuentes antes de una demo posterior sin cambiar fechas para volverlas futuras.

## Entorno y límites operativos

El usuario eligió **localhost con recarga automática**. Al cerrar DP-04 se comprobó HTTP 200, worker watch escuchando y migración aditiva **007** aplicada a la base local; no se cargaron fixtures ni se modificaron sus investigaciones. No se repitieron esas comprobaciones para este handoff.

- Base del usuario: `growthx-postgres`, puerto 54329. Preservar datos y procesos; no ejecutar suites ni `db:down` contra ella.
- Worker: `pnpm worker:dev`, Node con `--env-file=.env.local --watch worker/index.ts`; referencias temporales `/tmp/growthx-local-worker.log` y `/tmp/growthx-local-worker.pid`. Verificar identidad antes de controlar un proceso. Los cambios de configuración requieren reinicio del worker; recargar la UI no aplica migraciones.
- Pruebas DP-04: `growthx-dp04-verification`, puerto 55444, detenido al cierre con datos conservados. El archivo temporal de sesión del smoke se eliminó. DP-05 usó Node 25 y `growthx-dp05-verification`, puerto 55445, con Next/build y workers aislados; cerró sus procesos y detuvo únicamente su contenedor, conservando los datos. No reinició servicios compartidos. Comandos reproducibles en sus respectivas matrices.
- Pruebas DP-06: `growthx-dp06-verification`, puerto 55446; build propio `/tmp/growthx-dp06-production`, sin copiar `.env*`. Next/worker de pruebas cerrados y contenedor detenido, con datos conservados según [estado de cierre](evidence/DP-06/environment-final.json). Reproducción y reapertura real sin nuevas consultas en la [matriz](evidence/DP-06/README.md#entorno-aislado-y-reproducción). Cero llamadas Exa/Apify adicionales en esta entrega; conservar los presupuestos existentes.
- `frontend/.env.local` está ignorado por Git. No copiar claves al handoff, logs ni respuestas. El usuario pidió detenerse si necesita configurar una credencial; el reemplazo de Exa ya fue confirmado y probado.

Vercel quedó pendiente en una sesión anterior: la portada respondía, pero la API fallaba por falta de base configurada. Un push anterior expresamente autorizado terminó “Everything up-to-date”; no constituye autorización vigente ni demuestra funcionamiento completo. La instrucción actual es **sin commit, push, despliegue ni mensajes externos**.

El árbol contiene numerosos cambios previos y concurrentes de DP-01 a DP-06 y DP-08. Se revisó el estado del archivo para este resumen; no atribuir todo el diff a una sola sesión ni restaurarlo para limpiar. Los manifiestos documentan cortes de cada entrega. Durante las implementaciones paralelas DP-05/06 dejaron índice y handoff sin editar por coordinación; **el pedido actual autoriza actualizar este handoff** y prevalece sobre esa restricción anterior. Se conservó el contexto existente de DP-04/05. En este pedido solo se actualizó `PuentesHandoff.md`, sin nuevas pruebas de aplicación, migraciones, llamadas pagas ni cambios de servicios.

## Suggested skills

En la próxima sesión, invocar la skill pertinente con la herramienta de skills disponible o leer su `SKILL.md` antes de aplicarla:

- [handoff](../.agents/skills/handoff/SKILL.md): mantener este traspaso con referencias y procedencia.
- [codebase-design](../.agents/skills/codebase-design/SKILL.md): si la siguiente tarea necesita diseñar la conexión del dossier con la comparación, reutilizando discovery, lectura y relaciones ya implementados.
- [research](../.agents/skills/research/SKILL.md): para comparar modos/proveedores si se solicita.
- [diagnosing-bugs](../.agents/skills/diagnosing-bugs/SKILL.md): ante un fallo reproducible del recorrido local.
- [design-taste-frontend](../.agents/skills/design-taste-frontend/SKILL.md): si el próximo pedido aborda la experiencia DP-10, auditar la interfaz existente y conservar los contratos y comportamientos verificados de DP-07/08/09.

No iniciar tareas adicionales ni rediseños por la disponibilidad de skills; seguir el próximo pedido del usuario.
