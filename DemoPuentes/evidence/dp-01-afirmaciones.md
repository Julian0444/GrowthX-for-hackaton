# DP-01 — Soporte por afirmación

**Referencia documental, no contrato de API ni datos cargados en el producto.** Cada fila une una afirmación con su entidad, edición, fuente y pasaje pertinente. Una insignia de premio no respalda tecnología utilizada; un logo de sponsor no respalda adopción en proyectos. Los IDs A01–A15, B01–B28 y C01–C08 son referencias editoriales.

## Antecedente AIT: lectura y fuentes

Consulta: **2026-09-10, aproximadamente 17:08–17:10 UTC / 10:08–10:10 America/Los_Angeles**. Las cuatro páginas se reabrieron en Chrome mediante lectura pública de accesibilidad, sin login. El lector web falló con 403 en ANT-01, ANT-02 y ANT-04; ANT-03 tampoco pudo abrirse por esa vía. El navegador sí mostró el contenido. No se reprodujeron videos ni se abrieron o ejecutaron repositorios.

| Fuente | URL estable | Papel de la fuente |
| --- | --- | --- |
| ANT-01 | [Ficha de edición](https://sf.aitinkerers.org/p/ai-tinkerers-sf-secure-agents-buildathon) | Anuncio y roles de la edición. Su enlace de resultados lleva a ANT-02. |
| ANT-02 | [Galería de resultados](https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/showcase) | Fecha, ciudad, contadores publicados y enlaces a cada proyecto. |
| ANT-03 | [Detalle Citadel](https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/entries/ht_-q61ElFncwo) | Premio, declaración del proyecto, herramientas y enlaces. |
| ANT-04 | [Detalle Cleo](https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/entries/ht_pL8a-_-lqzk) | Insignia, descripción y herramientas del proyecto cuyo título de ficha es MyCodeDontJiggleJiggle. |

**Edición común E-AIT:** Secure Agents Buildathon, San Francisco, 06/12/2025. ANT-01 enlaza ANT-02; las tarjetas de ANT-02 enlazan exactamente ANT-03 y ANT-04. Las relaciones se comprobaron por navegación y enlaces visibles, no por coincidencia de nombre. Fecha/método de todas las filas: consulta pública anterior. Los localizadores describen el lugar para volver a encontrar el pasaje; los fragmentos entre comillas son transcripciones breves exactas.

| ID | Entidad + edición | Atributo → valor | Estado de la afirmación | Fuente + fragmento exacto | Localizador y límite |
| --- | --- | --- | --- | --- | --- |
| A01 | E-AIT | Fecha publicada → 06/12/2025 | `announced` histórico | ANT-01: “December 6, 2025” | Bloque de detalles, primera línea; acredita fecha anunciada. |
| A02 | E-AIT | Ciudad publicada → San Francisco | `reported` por galería | ANT-02: “San Francisco” | Cabecera de la galería bajo nombre de edición; no acredita venue. |
| A03 | Google Cloud + E-AIT | Rol → sponsor reconocido en la edición | `announced` | ANT-01: “Thank you to”; “Google Cloud” | Bloque de patrocinio/comunidad, agradecimiento enlazado; no acredita monto pagado. |
| A04 | Wordware + E-AIT | Rol → anfitrión de sede | `announced` | ANT-01: “Venue Host”; “Wordware” | Encabezado de sede seguido del nombre; no trasladar venue a otra edición. |
| A05 | E-AIT | Temática → monitoreo, auditoría y recuperación de agentes | `announced` | ANT-01: “Monitoring, auditing, and recovery patterns for long-running agents” | Cuarta viñeta del bloque sobre qué construir; no resultado observado. |
| A06 | Galería + E-AIT | Proyectos publicados → 6 | `reported` por plataforma | ANT-02: “6 projects” | Contador bajo introducción de proyectos; cantidad publicada, sin auditoría de implementación. |
| A07 | Galería + E-AIT | Videos enlazados → 2 | `reported` por plataforma | ANT-02: “2 videos” | Contador junto a A06; no videos reproducidos. |
| A08 | Citadel + E-AIT | Reconocimiento → primer puesto | `reported` por plataforma | ANT-03: “1st Place Winner” | Insignia encima del título; acredita premio publicado, no herramientas ni eficacia. |
| A09 | Citadel + E-AIT | Herramienta declarada → Google Cloud | `reported` por proyecto | ANT-03: “Google Cloud” | Lista de productos/herramientas, después de la entrada DLP y antes del kernel; no uso ejecutado ni adopción posterior. |
| A10 | Citadel + E-AIT | Tipo declarado → gateway de seguridad para MCP | `reported` por proyecto | ANT-03: “Security Gateway”; “solution for MCP” | Final del título y segundo párrafo de descripción; propuesta técnica, no eficacia verificada. |
| A11 | Citadel + E-AIT | Comportamiento declarado → seguimiento de riesgo y respuesta a cambios del agente | `reported` por proyecto | ANT-03: “tracks stateful risk”; “behavior drifts” | Último párrafo de descripción, bloque de identidad/riesgo; no prueba de detección ni precisión. |
| A12 | Citadel + E-AIT | Artefacto enlazado → repositorio público de código | `reported` como enlace observado | ANT-03: “Github Project” | Enlaces adicionales: destino [NineSunsInc/fast-mcp-scanner](https://github.com/NineSunsInc/fast-mcp-scanner). No se abrió ni ejecutó. |
| A13 | Cleo / MyCodeDontJiggleJiggle + E-AIT | Reconocimiento → segundo puesto | `reported` por plataforma | ANT-04: “2nd Place Winner” | Insignia sobre título de ficha; no respalda herramientas. |
| A14 | Cleo / MyCodeDontJiggleJiggle + E-AIT | Herramienta declarada → Google Cloud | `reported` por proyecto | ANT-04: “Google Cloud” | Primera entrada del bloque de productos/herramientas, antes del enlace de reson; no uso ejecutado. |
| A15 | Cleo / MyCodeDontJiggleJiggle + E-AIT | Función declarada → material de difusión desde actividad del constructor, con decisión humana de publicación | `reported` por proyecto | ANT-04: “Cleo”; “capture your screen”; “associated collateral”; “human in the loop” | Párrafo único de descripción: vincula nombre Cleo, captura, contenido y control humano. No prueba eficacia ni cumplimiento. |

## Límites de interpretación y revisión

- A03 y A09/A14 sostienen relaciones distintas: patrocinador de edición frente a herramienta declarada por proyectos. A08/A13 documentan premios por separado. La combinación justifica investigar una activación técnica; no demuestra causalidad del patrocinio, ROI, retención o adopción duradera.
- A10/A11 son afirmaciones de los autores. No se trasladan a Growth Atlas como garantías de seguridad ni se verificaron latencia, tasas de ataque o ausencia de filtraciones.
- El encabezado de ANT-01 etiqueta el horario histórico con **PDT**, mientras el cuerpo publica horas sin zona. Se conserva la discrepancia para revisión temporal; esta tabla usa solo fecha local y no convierte ese horario a UTC.
- No hay afirmación verificada de asistencia real a partir de capacidad, registros o contadores. Tampoco hay costo comercial verificado.
- Fragmentos breves de estas cuatro URL en esta sección: ANT-01 **19 palabras**, ANT-02 **6**, ANT-03 **17**, ANT-04 **15** en fragmentos entre comillas. Los localizadores detallados permiten revisar el contexto sin copiar las páginas completas.

Esta tabla respalda afirmaciones documentales concretas; no cambia por sí sola el estado de DP-01 ni reemplaza las limitaciones de [antecedentes](dp-01-antecedentes.md).

## Oportunidades: soporte de atributos decisivos

Fuentes F1–F6: URL y método en [el índice del caso](dp-01-caso-y-fuentes.md#fuentes-de-las-oportunidades). Revisión **2026-09-10**: F1 reabierta en navegador público; F2–F6 en lector web, F2 también en navegador y F6 además mediante JSON-LD público. Las filas citan el pasaje o el campo preciso, no la página como prueba indistinta de todos los atributos. `announced` significa anunciado; no confirmado comercialmente. Estos IDs B son editoriales.

| ID | Entidad / edición | Atributo → valor | Estado | Fuente y pasaje específico |
| --- | --- | --- | --- | --- |
| B01 | O1, 12/09/2026 | Fecha y horas locales → 12/09/2026, 10–17 PDT | `announced` | F1, Event details: líneas Date y Time. |
| B02 | O1 | Ciudad → SF | `announced` | F1, encabezado de capítulo San Francisco y detalles de esta edición local. |
| B03 | O1 | Acceso → solicitud sujeta a revisión | `announced` | F1, formulario de solicitud y texto de revisión por organizador; no la cantidad de solicitudes. |
| B04 | O1 | Sede → oculta hasta aceptación | `announced` | F1, Event details, línea Location; fragmento transcrito en F1 del índice. |
| B05 | O1 | Evaluación → global, sin juzgamiento local formal | `announced` | F1, bloque sobre revisión de proyectos; oración exacta transcrita como ORG-04 en la ficha de organizadores. No heredar premios de E-AIT. |
| B06 | O1 | Sponsors globales → OpenAI, CopilotKit, OpenRouter | `announced` | F1, listado bajo Global Sponsors. No implica sponsor local ni monto. |
| B07 | O1 | Partners de infraestructura → Exa, Trigger.dev, Auth0, Mozilla, Ambiguous AI | `announced` | F1, listado separado bajo Developer Infrastructure Partners. |
| B08 | O1 | Entregable → repo público | `announced` | F1, What every team submits, ítem de repositorio GitHub público. |
| B09 | O1 | Entregable → video del proyecto | `announced` | F1, What every team submits, ítem de video/demo, separado del repositorio. No se asume permiso para nuestro desafío. |
| B10 | O2, 13/09/2026 | Fecha y horas locales → 13/09/2026, 09:30–19:30 PDT | `announced` | F3, Date y Hours; zona explícita en F4, Hours de Next event; F2 muestra la misma edición. |
| B11 | O2 | Dirección → EF, 501 Folsom St, SF, CA 94105, USA | `announced` | F2, Ubicación; F3, Where, coincide en calle/número/ciudad. La mención amplia South Park en F4 difiere: conservar conflicto. |
| B12 | O2 | Coordenadas enlazadas → 37.786980299999996, -122.39447709999999 | `announced`, enlace observado | F2, destino del enlace de Google Maps en Ubicación. URL completa, proveedor, fecha y límite de precisión en [ficha de ubicación](dp-01-caso-y-fuentes.md#ubicación-de-referencia-para-dp-0809). No derivadas de South Park. |
| B13 | Wasmer + O2 | Rol → presentador y sponsor | `announced` | F2, bloque Presented by y bloque Sponsors, ambos nombran Wasmer. Cada rol proviene de su propio bloque. |
| B14 | Track Wasmer + O2 | Condición anunciada → construir con su SDK | `announced` | F2, Sponsors, línea Wasmer track; fragmento específico transcrito en el índice F2. No acredita uso efectivo. |
| B15 | Tenki + O2 | Rol → sponsor | `announced` | F2, Sponsors/premios, bloque Tenki. Su presencia como host tiene soporte independiente en B16. |
| B16 | Hosts + O2 | Listado → Julius Olsson, Sahar Mor, BuilderBase, Ayush Ojha, Sean Chiu, Tenki Cloud | `announced` | F2, Hosted By. No asigna automáticamente responsabilidad operativa o contractual a todos. |
| B17 | EF + O2 | Rol → venue partner | `announced` | F2, bloque de Entrepreneurs First encabezado como venue partner. No acredita patrocinio comercial. |
| B18 | Hackathons.team, revisión 10/09 | Historia publicada → primera edición, sin pasadas | `reported` por iniciativa | F4, Past events, fragmento transcrito en el índice F4 y oración siguiente que identifica su primer evento. No historia personal de Julius. |
| B19 | Hackathons.team, revisión 10/09 | Agenda contradictoria → próxima edición y mensaje de agenda vacía | `reported` con conflicto | F4, Next event / Upcoming events frente al mensaje inmediatamente anterior a Past events; texto contrario transcrito en ORG-06. F2/F3 conservan ficha y fecha. No prueba cancelación. |
| B20 | Patrocinio Hackathons.team, general | Modalidad → workshop/office hours | `announced` | F5, What sponsors get, cuarta viñeta; fragmento transcrito en índice F5. No disponibilidad de O2. |
| B21 | Patrocinio Hackathons.team, general | Contactos → introducciones con opt-in | `announced` | F5, What sponsors get, quinta viñeta, comienza “Opt-in introductions”. No acceso a todos los asistentes. |
| B22 | Patrocinio Hackathons.team, general | Entregable → reporte posterior de participación, producto y resultados | `announced` | F5, What sponsors get, sexta viñeta, comienza “A short report afterwards”. No reporte contratado ni existente. |
| B23 | Patrocinio Hackathons.team, general | Precio → paquetes no publicados, propuesta por evento | `announced` / cotización `pending` | F5, párrafo inicial y párrafo anterior a Enquiry; frase sobre paquetes transcrita en índice F5. |
| B24 | O3, 26–27/09/2026 | Inicio/fin → 26/09 09 PDT–27/09 17 PDT | `announced` | F6, cabecera visible para mes/día/hora/zona; JSON-LD Event.startDate y endDate para año/UTC: valores exactos en índice F6. Conversión a America/Los_Angeles comprobada localmente. |
| B25 | Vultr + O3 | Rol → host | `announced` | F6, Hosts y primera frase de descripción. Cerebral Valley es la plataforma de la ficha. |
| B26 | O3 | Ubicación → solo ciudad SF | `announced`; sede `pending` | F6, enlace de ciudad bajo título y nota final de presencialidad. No contiene dirección de venue; sin pin exacto. |
| B27 | O3 | Acceso → aplicar, obtener aprobación y confirmar asistencia | `announced` | F6, nota final con condiciones de asistencia; solicitud no garantiza plaza. |
| B28 | O3 | Precio estructurado de entrada → USD 0 | `announced` estructurado | F6, JSON-LD Event.offers.price y priceCurrency. No precio de sponsor ni presupuesto total; availability no revoca B27. |

## Roles históricos e identidad: referencias específicas

Consulta **2026-09-10**, fuentes primarias y métodos en [organizadores](dp-01-organizadores.md#fuentes-reabiertas-en-esta-revisión). Estos localizadores amplían el índice ORG sin tratar nombre, profesión y responsabilidad del día como una sola afirmación.

| ID | Afirmación y estado | Soporte por atributo / límite |
| --- | --- | --- |
| C01 | Vultr participó como sponsor de RAISE 2025, `reported` | [ANT-05 / ORG-12](https://blogs.vultr.com/vultr-at-RAISE-2025), sección de hackathon, oración sobre patrocinio transcrita en antecedentes. |
| C02 | lablab.ai organizó ese hackathon, `reported` | Misma oración de ANT-05: cláusula que atribuye explícitamente la organización al partner lablab.ai. No la atribuye a Vultr. |
| C03 | Antecedente RAISE 2025 en París, `reported` | ANT-05, introducción del recap con ciudad y edición 2025; no trasladar ciudad ni resultados a O3. |
| C04 | AIT es comunidad global con capítulo SF, descripción propia | ORG-01, presentación de comunidad; ORG-02, cabecera y descripción del capítulo SF. La relación del antecedente con el capítulo está en ANT-01/02. |
| C05 | Ian Butler dirige el capítulo; responsable del día O1 pendiente | ORG-03, ficha Ian Butler / Chapter Lead. Las fichas de Dexter Horthy, Jake Laes y Uli Barkai están en el grupo del capítulo; Abdoulaye Doucoure en Hackathons. No se publica asignación operativa de O1. |
| C06 | Julius Olsson organiza Hackathons.team; iniciativa sin empresa/staff, descripción propia | ORG-05, Who is behind it y la presentación inicial. BuilderBase figura separadamente como plataforma de registro/entregas/puntuación. Hosts de O2: B16, sin equivalencia automática de responsabilidades. |
| C07 | Vultr provee infraestructura cloud; responsable del día O3 pendiente | ORG-09, título y descripción de VMs/API. ORG-11 solo muestra perfil/nombre. Su rol de host se acredita por B25, no por ser proveedor cloud. |
| C08 | Audiencia declarada distinta de asistencia efectiva | F1, Who should come; F3, Who should come; F6, descripción técnica y nota de equipos. Respaldan público convocado (`announced`). A06/A07 cuentan publicaciones (`reported`). Ninguna de esas secciones acredita quién asistió ni adopción comercial. |

## Correspondencia con R1–R15

| Resultado esperado | Afirmaciones que lo sostienen |
| --- | --- |
| R1 | B01–B03. Ser futura resulta de comparar la fecha anunciada con el corte y ventana del brief. |
| R2 | B04. |
| R3 | B06/B07; formato de evaluación separado en B05. |
| R4 | B10–B12. |
| R5 | B13–B17. |
| R6 | B18. |
| R7 | B20–B23. |
| R8 | B24/B25. |
| R9 | B26–B28. |
| R10 | A01–A15 y C01–C03: edición, premio, herramientas, funciones y roles permanecen separados. |
| R11 | Inferencia del [antes/después](dp-01-caso-y-fuentes.md#antes-hallazgo-después-y-condición-de-avance), basada en A08–A12, B05/B08/B09 y B18/B20–B23. No hay fuente que pruebe compra, ROI, disponibilidad o costo completo. |
| R12 | C04–C07, B16/B25: entidad, rol y responsable no son intercambiables. |
| R13 | C04 + A01–A15 (AIT organizando) y B25 + C01–C03 (Vultr actual host, pasado sponsor). Son dos entidades con antecedentes, una con historia como organizador. |
| R14 | B19, contrastado con B10/B11. |
| R15 | C08, A06/A07; no consta asistencia efectiva. |

DP-03 debe preservar estas distinciones al definir contratos; DP-04/05 deben volver a obtener y revisar el contenido. Los pasajes de una página mutable pueden cambiar: URL, localizador y fecha facilitan volver a verificar, pero no equivalen a un snapshot inmutable ni a un test de vigencia futura. Las afirmaciones contextuales de las notas que no aparecen aquí no se convierten automáticamente en referencia aceptada para extracción.
