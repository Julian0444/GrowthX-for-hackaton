# DP-01 — Caso de referencia: observabilidad para agentes

Revisión: 2026-09-10, America/Los_Angeles. Material: fuentes públicas reales y un **comprador ficticio ilustrativo**, sin cliente ni validación comercial. Revisor: Codex; lectura individual asistida, no certificación humana de los eventos. Los anuncios siguen siendo `announced`, los recaps atribuidos `reported`, las propuestas `inferred` y las condiciones sin respuesta `pending`.

## Comprador y pregunta

El equipo ilustrativo vende una plataforma B2B de observabilidad y evaluación de agentes, con SDK Python/TypeScript. DevRel y growth buscan equipos que ya construyen agentes y puedan probar instrumentación de trazas, fallos y evaluaciones en un proyecto práctico.

- Objetivo del ejemplo: explorar adopción técnica y conversaciones cualificadas. Éxito propuesto: equipos que voluntariamente instrumenten un proyecto y den feedback; no hay cantidad ni conversión prometida.
- Presupuesto comercial total máximo: **USD 5.000**, incluyendo patrocinio/entrada, personal, materiales, premios propios y desplazamiento local. Equipo supuesto ya en SF; eso no vuelve gratuitos sus costos. Todas las partidas permanecen pendientes hasta estimación/cotización.
- Ventana: **10 de septiembre–22 de octubre de 2026**, inclusiva, con fechas locales de `America/Los_Angeles`. Ningún evento pasado es una oportunidad futura.
- Formatos: build day, hackathon, workshop técnico u office hours. Un track de instrumentación es una idea a negociar, no inventario disponible.
- Restricciones: no comprar solo exposición de logo; no exigir datos de participantes sin opt-in; no comprometer gasto sin costo completo, acceso, audiencia y modalidad acordados.

Es adecuado porque las fuentes permiten contrastar proyectos y actividades prácticas con restricciones reales: sedes pendientes, aprobación y poco tiempo para organizar una participación. La pertinencia es una inferencia del ejemplo; nadie declaró intención de contratar Growth Atlas ni este devtool.

## Fuentes de las oportunidades

Todas se consultaron el **2026-09-10**. Los identificadores de esta nota son referencias editoriales, no IDs del catálogo ni un contrato paralelo de frontend. Se conservan fragmentos breves y localizadores; no se redistribuyen páginas completas ni datos de asistentes.

| ID | Fuente primaria y método de lectura | Localizador y fragmento de referencia |
| --- | --- | --- |
| F1 | [Agents, Everywhere — edición SF](https://sf.aitinkerers.org/p/agents-everywhere-bots-channels-more-global-hackathon). Navegador público sin sesión; el lector web y fetch directo devolvieron 403, el navegador mostró el contenido. | Event details: “Location: Shared upon acceptance”. What every team submits: “Public GitHub repository”. Global Sponsors; Developer Infrastructure Partners. |
| F2 | [AI Security Hackathon — Luma](https://luma.com/7a4iutvp). Lector web y navegador público. | Sponsors: “Wasmer track — best projects built with the Wasmer SDK”. Location: “501 Folsom St”; “San Francisco, CA 94105, USA”. |
| F3 | [AI Security Hackathon — organizador](https://www.hackathons.team/events/ai-security-hackathon-2026/). Lector web, enlazado desde su portada y con enlace de vuelta a F2. | Ficha: “Date Sun, Sep 13 2026”; “Where EF, 501 Folsom St, SF”. |
| F4 | [Hackathons.team — iniciativa](https://www.hackathons.team/?utm_source=luma). Lector web; enlace de F2. | Past events: “None yet.” Who we are identifica a Julius Olsson y el inicio en 2026. |
| F5 | [Hackathons.team — patrocinio](https://www.hackathons.team/sponsor/enquire/). Lector web; solo lectura, sin abrir ni enviar el formulario. | What sponsors get: “A workshop or office-hours slot during the build.” Condiciones: “We do not publish packages.” |
| F6 | [The Agent Arena Hackathon](https://cerebralvalley.ai/e/vultr-the-agent-arena). Lector web, navegador público y JSON-LD de HTML público con HTTP 200. | “Hosts Vultr”. Encabezado Sep 26–Sep 27, PDT. JSON-LD `startDate=2026-09-26T16:00:00.000Z`, `endDate=2026-09-28T00:00:00.000Z`. |

El índice de Cerebral Valley sirvió para descubrir F6, pero incluye eventos de otras ciudades y fechas pasadas. Se verificó la ficha propia: el dominio/calendario no acredita organización. Los contadores de solicitudes/“asistirán” de Luma y AI Tinkerers no se usan como asistencia real.

## Quién organiza y qué trayectoria podemos respaldar

La [ficha de organizadores](dp-01-organizadores.md) reúne identidad, rol actual, antecedentes, audiencia y preguntas abiertas. La cobertura real es **tres organizadores/hosts actuales investigados; dos con antecedentes documentados (AI Tinkerers: organización con resultados en SF; Vultr: patrocinio en París), uno con historial como organizador**. Hackathons.team declara su primera edición. SF restringe las oportunidades futuras; los antecedentes pueden ser de otras ciudades. El rol pasado siempre permanece visible.

| Opción | Organizador / host documentado | Trayectoria que aporta al caso | Qué falta |
| --- | --- | --- | --- |
| O1 | AI Tinkerers, capítulo SF; comunidad de builders. | Edición local anterior vinculada a programa, sponsor y proyectos publicados (ANT-01–04). | Responsable operativo de esta edición, audiencia efectiva, disponibilidad y costo. |
| O2 | Hackathons.team, iniciativa de Julius Olsson; F2 lista otros hosts cuyos cometidos no están detallados. | La iniciativa declara su primera edición; no hay resultados anteriores propios publicados (F4). | Reparto de responsabilidades, referencias, acceso y entregables concretos. |
| O3 | Vultr figura como host en F6. Cerebral Valley aloja la ficha. | No se verificó un evento previo organizado por Vultr en SF. Su participación pasada como sponsor se conserva aparte. | Equipo organizador local, antecedentes como organizador, sede y modalidad comercial. |

Esto responde al expediente del organizador previsto en finalProduct, sección 6. El dossier futuro debe abrir esta información desde cada evento, con fuentes por atributo; hoy es referencia documental, no una pantalla implementada.

## Tres opciones futuras, con condiciones

### O1 · Agents, Everywhere — SF, 12 de septiembre de 2026

**Leído en F1:** 10:00–17:00 PDT; capítulo San Francisco de AI Tinkerers, dentro de un hackathon global. Build day para builders, con solicitud y revisión del organizador. La sede se revela tras aceptación. Exige repositorio público y video de proyecto. La revisión es global; la edición no anuncia juzgamiento local formal. No heredar el jurado ni los premios del antecedente de 2025. OpenAI, CopilotKit y OpenRouter figuran como sponsors globales; Exa, Trigger.dev, Auth0, Mozilla y Ambiguous AI como partners de infraestructura. Esos roles no prueban pago ni sponsorship local.

**Inferencia:** explorar instrumentación durante el build y soporte técnico. El antecedente de AI Tinkerers en [la revisión de antecedentes](dp-01-antecedentes.md) aporta soporte histórico, sin transferir sus sponsors/proyectos a esta edición.

**Preguntas materiales:** ¿aceptan todavía una contribución técnica y bajo qué términos, a dos días del evento? ¿Puede incorporarse nuestro SDK al starter kit? ¿Qué audiencia local está aprobada y cuál es el costo total? Acceso, capacidad comercial y costos: pendientes. **Mapa:** sin pin; sede oculta, no reconstruirla desde ediciones pasadas.

### O2 · AI Security Hackathon — SF, 13 de septiembre de 2026

**Leído en F2/F3:** 09:30–19:30, horario Pacific/PDT, EF en 501 Folsom St. Iniciativa Hackathons.team/Julius Olsson; Luma lista además Sahar Mor, BuilderBase, Ayush Ojha, Sean Chiu y Tenki Cloud como hosts. Wasmer aparece como presentador y sponsor con track SDK; Tenki también figura en sponsors y premios; EF es venue partner. No reducir todos esos roles a un único organizador. Se orienta a seguridad/agentes, con demos y evaluación de uso del producto en tracks. F4 declara que todavía no tiene eventos pasados; la entrada se anuncia gratuita por solicitud, no el patrocinio.

**Inferencia:** posible track de instrumentación de fallos de agentes, con office hours. F5 ofrece ese formato en general; no confirma un espacio libre el 13/09. **Condición:** exigir propuesta específica, entregables y costos; preguntar cómo documentarán proyectos y feedback con opt-in, dado que falta historial publicado de la iniciativa. F2/F3 admiten excepciones remotas aunque se prioriza presencia. No tratarlo como acceso remoto garantizado. **Mapa:** candidato principal anunciado; ver ficha de ubicación abajo. F4 también contiene un mensaje de que no hay eventos programados, inconsistente con su propia ficha de próxima edición y con F2/F3. Conservar el conflicto como pendiente de vigencia; no deducir cancelación ni plena consistencia del anuncio.

### O3 · The Agent Arena Hackathon — SF, 26–27 de septiembre de 2026

**Leído en F6:** 26/09 09:00–27/09 17:00 PDT. El año proviene del JSON-LD público y concuerda con el calendario de septiembre; la ficha visible omite el año. Host: **Vultr**, no Cerebral Valley. Infraestructura para ejecución de agentes, VM e inferencia; presencial, equipos de hasta cuatro, solicitud aprobada y confirmación de asistencia. Solo ciudad, sin venue. El JSON-LD indica entrada USD 0; el premio anunciado mezcla efectivo y créditos. Ninguno es tarifa comercial.

**Inferencia:** explorar una integración técnica de trazas/diagnóstico sobre su infraestructura; deja más preparación que O1/O2, pero falta verificar trayectoria como organizador y viabilidad comercial. No se asigna prioridad global a esta opción. La participación externa de la marca queda como contexto secundario en [antecedentes y límites](dp-01-antecedentes.md), excluida del soporte de organización local.

**Preguntas materiales:** ¿admiten un devtool complementario, workshop/mentoría o track? ¿Qué restricciones tiene el stack? ¿Cuál es la sede, acceso del equipo, audiencia y costo acumulado? No hay paquete disponible confirmado. **Mapa:** sin pin; conocer SF solo permite centrar la vista.

## Ubicación de referencia para DP-08/09

| Campo | Evidencia y valor permitido |
| --- | --- |
| Evento | O2, edición del 13/09/2026; nunca reutilizar este punto para O1/O3. |
| Venue | EF / Entrepreneurs First, anunciado como venue partner en F2 y nombrado en F3. |
| Dirección original | `501 Folsom St`, `San Francisco, CA 94105, USA` (F2). F3 coincide con calle, número y ciudad. |
| Coordenadas publicadas | Latitud `37.786980299999996`, longitud `-122.39447709999999`, visibles en el destino del enlace público “Ver en Google Maps” de la sección Ubicación de F2. |
| Enlace inspeccionado | [Mapa enlazado por la edición](https://www.google.com/maps/search/?api=1&query=37.786980299999996%2C-122.39447709999999&query_place_id=ChIJD0JydXuAhYARyS30W8KsgSg). No es una consulta de geocodificación ejecutada por Growth Atlas. |
| Método / proveedor | Coordenadas extraídas del enlace público de ubicación de Luma hacia Google Maps. Fuente del evento: F2, contrastada con F3. Consulta: 2026-09-10. |
| Precisión | Punto asociado al lugar/dirección por la página; precisión métrica y entrada física no documentadas. No certificar exactitud GPS por el número de decimales. |
| Estado | Ubicación `announced`, revisión de fuente asistida por Codex. No `confirmed` comercial ni verificación presencial. |
| Diferencia conservada | La portada F4 usa la referencia amplia “South Park”; las dos fichas de edición F2/F3 publican la misma dirección completa. No geocodificar “South Park” ni presentarlo como barrio comprobado del punto. |

Este material cumple la selección de una sede respaldada de DP-01. Dibujar el marcador, guardar su revisión y probar selección/reapertura corresponde a DP-08/09/11/12. Para el caso específico **dirección sin coordenadas**, DP-08 debe usar una prueba controlada que omita las coordenadas y se etiquete como tal; no decir que F2 carecía de ellas.

## Hallazgo que cambia la decisión

El antecedente local de **AI Tinkerers** aporta proyectos publicados que justifican investigar una integración técnica demostrable. **Hackathons.team** anuncia un formato pertinente pero declara que todavía no tiene resultados pasados propios. Para el segundo hace falta pedir referencias y entregables; para el primero, comprobar que la edición actual permite reproducir un formato útil. La diferencia es de evidencia y condiciones, no una certificación de calidad.

La versión inicial sugería investigar O3 primero por temática y tiempo disponible. Esa prioridad era demasiado concluyente para un dossier sin trayectoria organizadora local, sede ni términos comerciales: **se retira como conclusión principal**. Tener más días de preparación sigue siendo una diferencia factual. AIT es el ejemplo más documentado para enseñar antecedentes; eso no lo convierte en la mejor inversión ni resuelve la cercanía de su fecha. O2 permite enseñar el mapa y la falta de historial; O3 queda como candidata para completar investigación. Ninguna opción tiene costo total compatible ni participación aprobada.

París no es una cuarta oportunidad ni debe aparecer en la lista/mapa de SF. El producto permite antecedentes de otras ciudades, pero este caso además cambia de rol: Vultr fue sponsor de un evento organizado por lablab.ai. Esa participación cuenta como antecedente de la entidad hoy anfitriona de O3, pero no como experiencia pasada organizando. No justifica por sí sola priorizar O3.

### Antes, hallazgo, después y condición de avance

El siguiente antes/después es una reconstrucción explícita del **comprador ilustrativo**, no una decisión observada de un cliente. El brief ya excluía comprar solo exposición de logo; no inventamos que esa fuera su intención anterior.

| Paso | AIT / O1 | Hackathons.team / O2 |
| --- | --- | --- |
| Antes de revisar antecedentes | Explorar un workshop o participación técnica genérica, sin definir cómo comprobar una integración. | Explorar una actividad técnica por el tema seguridad/agentes, sin diferenciar aún sus exigencias de evidencia. |
| Hallazgo documentado | La galería y el detalle de Citadel vinculan un proyecto y una declaración de herramienta con la edición anterior; el premio es un dato separado. La edición futura pide repo/video y tiene revisión global. | No publica ediciones anteriores; ofrece office hours y reporte posterior a nivel iniciativa, sin paquete de esa fecha confirmado. |
| Después — propuesta inferida | Pedir acompañamiento para instrumentar un agente y entregar repo/demo con un fallo y su diagnóstico; no proponer jurado o premio local heredado. | Pedir referencias, responsable, soporte y un reporte acordado de entregas/integraciones con opt-in antes de evaluar gasto. |
| Qué permitiría avanzar | Aceptación explícita del formato y acceso; posibilidad de usar el SDK y revisar voluntariamente repo/demo; costo completo dentro del presupuesto. | Propuesta de esta edición con responsables, entregables revisables, acceso y costo completo dentro del presupuesto. |
| Qué cambia si no se obtiene | Mantener pendiente o descartar esa modalidad si el formato global no la admite, no hay tiempo/acceso o el costo conocido supera el presupuesto. | Mantener pendiente si faltan respuestas; descartar la modalidad si no ofrecen entregables requeridos o el costo conocido excede el presupuesto. |

El cambio comprobable de la investigación es de **pregunta genérica a modalidad y condiciones concretas**. No se afirma aceptación del organizador, contratación ni mejora de adopción. El soporte atómico está en [afirmaciones revisadas](dp-01-afirmaciones.md); cada resultado esperado se vincula allí con su evidencia.

## Conjunto de referencia revisado

El [registro por afirmación](dp-01-afirmaciones.md) es el soporte de esta tabla: separa atributo, estado, fragmento o localizador específico, entidad y edición. F1–F6 y las notas narrativas son índices/resúmenes de fuentes; no certifican todos los atributos por compartir URL. Esta tabla fija lo que deben preservar las extracciones futuras; no es un test de vigencia web ni una carga de catálogo.

| Ref. | Afirmación esperada y soporte | No se puede afirmar |
| --- | --- | --- |
| R1 | F1: O1 es una edición SF futura el 12/09/2026, 10–17 PDT, por solicitud. | Solicitar equivale a asistir; un contador acredita audiencia real. |
| R2 | F1: sede compartida tras aceptación; ubicación pendiente. | Usar venue/coordenadas de un antecedente o de otra ciudad del hackathon global. |
| R3 | F1: sponsors globales y partners de infraestructura son roles distintos, anunciados para esa edición. | Logo = pago; partner = sponsor local; nuestro comprador está aceptado. |
| R4 | F2/F3: O2 el 13/09, fecha local; dirección de la edición y enlace público con coordenadas. | Venue confirmado presencialmente o precisión métrica comprobada. |
| R5 | F2: track del SDK de Wasmer, Tenki como sponsor y host listado, EF venue partner. | Wasmer único organizador; EF sponsor comercial; premio = costo del paquete. |
| R6 | F4: iniciativa nueva, sin eventos pasados publicados al revisar. | Ausencia de historial = fracaso, mala calidad o ausencia de experiencia personal de Julius. |
| R7 | F5: workshop/office hours y opt-in se ofrecen a nivel iniciativa; no publica paquetes. | Hay slot disponible el 13/09, acceso a todos los contactos o cotización USD 0. |
| R8 | F6: Vultr host; año 2026 en JSON-LD; 27/09 17 PDT corresponde a 28/09 00 UTC. | Fin local el 28/09; Cerebral Valley organizador por alojar la ficha. |
| R9 | F6: SF sin dirección; aprobación obligatoria. | Punto exacto o participación comercial/entrada garantizada por un `InStock` estructurado. |
| R10 | Nota de antecedentes: proyectos reportados vinculados a edición; Vultr sponsor en París, organizador distinto. | Proyectos de O3, historial de organización SF o adopción comercial medidos. |
| R11 | Comparación: posible integración/mentoría `inferred`; sin prioridad global mientras falten datos materiales. | Workshop contratado, presupuesto compatible completo, compra, ROI o intención de pago. |
| R12 | Fichas de organizadores: entidad, tipo, host/rol y responsable operativo separado cuando se conoce. | Un host listado asume automáticamente todos los compromisos; empresa/plataforma/comunidad son intercambiables. |
| R13 | Dos organizadores actuales con antecedentes: AIT como organizador y Vultr como sponsor; uno tiene historia como organizador. | Igualar sus roles pasados; exigir SF a todos los antecedentes; París como oportunidad del brief. |
| R14 | F4 presenta evento futuro y un mensaje contrario; F2/F3 conservan fecha/dirección. | Cancelación confirmada o vigencia sin conflicto. |
| R15 | Audiencia anunciada, proyectos publicados y asistentes efectivos son campos distintos del organizador/edición. | La audiencia declarada en el sitio es un censo de asistentes o clientes. |

## Demostración de fuentes y handoff

1. Leer el antes/después anterior. Abrir Citadel desde [el registro por afirmación](dp-01-afirmaciones.md): mostrar por separado edición, premio, herramienta declarada y repo enlazado. Explicar el paso a una propuesta de integración con entregables, sin atribuir eficacia técnica.
2. Abrir F4, sección Past events, y F5: O2 ofrece modalidades técnicas pero aún no publica resultados propios. Esa diferencia cambia las condiciones exigidas, no certifica que una opción vaya a funcionar mejor.
3. Abrir F2, sección Ubicación: comprobar dirección y enlace público de mapa. Comparar con F1 (oculta) y F6 (solo ciudad); únicamente O2 tiene punto respaldado en esta muestra.

**Material real:** F1–F6 y antecedentes enlazados. **Material ilustrativo:** comprador, presupuesto, objetivo y propuesta de actividad; deben etiquetarse incluso junto a eventos reales. **Fixtures existentes:** `frontend/lib/server/catalog/fixture-manifest.ts`, `frontend/lib/server/evaluations/fixture-catalog.ts` y `frontend/tests/fixtures/` siguen siendo sintéticos. No se modificaron, promovieron a curados ni cargaron estos documentos en DB. No se asignó una verificación humana a una extracción automática.

DP-03 puede tomar el brief y R1–R15 como referencia de contratos. DP-04/05 deben obtener su propia evidencia y registrar método/fecha/errores; esta investigación manual no demuestra su pipeline. DP-06 preserva roles y ediciones; DP-07 usa costos y acceso pendientes; DP-08/09 recibe la ficha de ubicación; DP-12 debe volver a revisar fuentes antes de grabar. Desde el 12/09 algunas opciones pronto dejan de ser futuras: no cambiar fechas para mantener la demo.
