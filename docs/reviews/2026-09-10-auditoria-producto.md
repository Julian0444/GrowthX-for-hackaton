# Revisión de Growth Atlas: producto, datos, interfaz y funcionamiento

Revisión realizada el 9 de septiembre de 2026 en Los Ángeles / 10 de septiembre UTC. Alcance: código hasta `ab4e4b5`, cambios locales existentes, planes, handoff, tickets 01–15, conversación adjunta de Cursor, pruebas automáticas y uso manual en Chrome. Base del diff: `480712c`. Este documento registra descubrimientos; no es un plan de implementación.

## Diagnóstico

**Hay una base técnica sustancial, pero todavía no hay una investigación comercial suficientemente útil alimentándola.** La app sabe conservar una evaluación, sus fuentes, condiciones y decisiones. Lo que ofrece hoy para evaluar organizadores, sponsors o proyectos es muy escaso y principalmente sintético. La interfaz da más protagonismo al funcionamiento interno que a las respuestas que necesita el comprador.

Esto explica la distancia entre “implementamos quince tickets” y “no veo la solución”. Buena parte de los tickets demuestran durabilidad, aislamiento y disciplina de evidencia. Esos logros evitan problemas, pero no producen por sí mismos buenos antecedentes, oportunidades pertinentes o una decisión comercial mejor.

Además, encontré defectos concretos en las reglas de evidencia y elegibilidad. Por tanto, tampoco conviene presentar la base técnica como una garantía completa de que la decisión conserva todas las incertidumbres.

## Qué producto se terminó construyendo

Hay tres relatos distintos en los materiales:

| Material | Promesa o estado | Lo que encontré |
| --- | --- | --- |
| `HackatonIdea.md` y README | Atlas de oportunidades y señales de crecimiento, con un horizonte de ejecución y resultados | Parte del código antiguo existe, pero no es el recorrido principal actual. |
| ADR, `finalProduct.md`, spec y tickets posteriores | Investigación de organizadores de SF; antecedentes → edición concreta → comparación → decisión condicional durable | Es el flujo que implementa la pantalla actual. Depende de un catálogo previamente alimentado. |
| Export de Cursor | Explica ese recorte y propone posibles incorporaciones de Exa/Apify | Es contexto de discusión, no una instrucción para implementarlas ni una prohibición permanente de cambiar el producto. Su estado de tickets ya quedó desactualizado. |

El ticket 15 sí tiene implementación técnica en el estado revisado; 14 y 15 están en `ab4e4b5`. La afirmación del chat de que faltaba implementar 15 y commitear 14 era temporal. En cambio, **la aceptación humana con datos reales sigue pendiente**, expresamente reconocida en [aceptacion-15.md](</Users/jirustaroure/Desktop/GrowthX for hackaton/.scratch/evaluacion-persistida/aceptacion-15.md>).

La búsqueda principal consulta el catálogo del tenant y encuentra coincidencias estructuradas con audiencia, stack y comparables. No sale a investigar la web. La descripción de producto y el objetivo no gobiernan directamente el matching de organizadores. El orden de resultados no acredita “mejor inversión”.

Exa y Apify están en el pipeline anterior de mercados, fuera del recorrido persistido principal. Sus señales antiguas tampoco equivalen a investigación de sponsors: Exa agrega pocos resultados por ciudad como evidencia del mercado; GitHub, Trends y X son proxies de actividad, no relaciones demostradas entre una empresa, una edición y un resultado comercial.

**Usar una API no determina la profundidad técnica del proyecto.** Lo que falta demostrar es qué trabajo útil resuelve con sus datos. No adopté como hechos las predicciones del chat sobre lo que valoraría un jurado ni sus juicios generales sobre redes sociales. Tampoco investigué las condiciones actuales de Puentes: no eran necesarias para esta revisión de la app.

## Qué consiguió la implementación

Se verificaron capacidades reales:

- Runs y pasos persistidos en PostgreSQL, con worker separado y cola durable.
- Recuperación ante caída del proceso, reentrega de jobs y competencia entre workers.
- Aislamiento entre tenants mediante API, roles y RLS.
- Claims con procedencia, estados y revisiones; identidades homónimas separadas.
- Importación de una URL Luma al catálogo durable.
- Comparación factual, registro de motivos y condiciones, y creación de un borrador de campaña.
- Reapertura de la decisión y campaña guardadas. Lo confirmé también cerrando y reabriendo mi pestaña de prueba.
- Ausencia explícita de score cuando no hay política aprobada. Esto es una decisión de alcance, no un error de ranking.

No está demostrado que el producto encuentre mejores patrocinios, ahorre tiempo a un comprador o mejore contratación, adopción o ventas. Tampoco están cerrados el onboarding normal de un piloto, la operación compartida y el catálogo comercial. La infraestructura probada es un activo; su beneficio de producto aún necesita evidencia propia.

## El catálogo que estaba viendo el usuario

Antes de mis importaciones, la investigación original contenía **4 organizadores, 7 ediciones y 2 coincidencias**. La consulta fue de solo lectura y limitada al tenant de esa sesión.

- Los cuatro organizadores eran sintéticos: Bay Builders Collective, Golden Gate ML Circle y dos identidades distintas de Mission AI Collective.
- Había una carga de fixtures y tres registros de importación Luma; **ninguna carga de catálogo curado real**.
- Las dos relaciones empresa–edición eran sintéticas: Quiver Labs con rol de patrocinador y Nimbus con presencia de logo. Los resultados comerciales estaban declarados desconocidos.
- Las siete ediciones se componían de cinco fixtures, una edición sintética de QA importada dos veces y una edición de apariencia real, *Software Factories Meet Production*. La lectura de DB no verificó externamente esa última página.

El material sintético está etiquetado. El problema no es que se haya demostrado un engaño: **se estaba usando una demostración de la mecánica como experiencia de investigación**, y no ofrece los antecedentes reales que el usuario esperaba.

El catálogo antiguo de eventos tampoco subsana esto: conserva otro modelo de datos y sus campos de sponsors/temas en el seed de SF están vacíos. No hay un flujo activo que convierta automáticamente esa colección en expedientes ricos de organizadores.

## Pruebas con dos eventos reales

Usé un perfil de prueba para una plataforma de observabilidad de agentes, SDK Python/TypeScript, audiencia de ingenieros y presupuesto de USD 5.000. La investigación devolvió dos organizadores sintéticos por coincidencias como `python` y `agents`.

Luego importé dos páginas públicas y comparé lo que la fuente mostraba con lo que guardaba la app:

| Fuente consultada | Información visible en la página | Resultado en la app |
| --- | --- | --- |
| [AI Security Hackathon — By Hackathons.team](https://luma.com/7a4iutvp) | Evento futuro en SF, audiencia descrita, participación de Wasmer y Tenki Cloud, premios/créditos y contexto del venue | Conservó nombre, fecha y ubicación. Audiencia, acceso y costo quedaron pendientes. No incorporó las relaciones de sponsors ni premios/temas publicados. El nombre de organizador extraído fue Wasmer, sin enlazar una identidad de organizador. |
| [The Integration Layer for AI Agents during SF a16z TechWeek](https://luma.com/14fq1fa2) | Open Future Forum como host, Agentic Fabriq como sponsor, temas de infraestructura de agentes y acceso sujeto a aprobación. El encabezado mostraba 6 de octubre y el cuerpo 5 de octubre, con horarios distintos | Conservó la fecha estructurada del 6 de octubre sin señalar la discrepancia. El organizador extraído correspondió al calendario a16z. No incorporó el sponsor, la audiencia ni las condiciones de acceso descritas. |

Estas son observaciones de las páginas al momento de la revisión. Un anuncio de sponsor no prueba pago; premios o créditos no equivalen a costo de patrocinio; la audiencia anunciada no demuestra asistentes reales. La oportunidad perdida aquí es conservar esas distinciones con información útil: actualmente buena parte del texto ni siquiera llega al dossier.

El importador extrae principalmente datos estructurados JSON-LD. No realiza una investigación del cuerpo de la página ni construye relaciones nuevas de sponsors, proyectos y antecedentes. Por eso agregar URLs no vuelve automáticamente útil la investigación de organizadores.

La comparación de las dos ediciones terminó como condicional, sin score y con pendientes de ciudad, acceso y costo. **La audiencia figuraba pendiente en el dossier, pero no se heredó como condición de la decisión.** El worker local tenía deshabilitada la narrativa de Gemini por falta de clave; esta prueba real fue determinística.

Registré una decisión claramente marcada como QA, con motivo y una pregunta sobre disponibilidad/precio de un workshop. El formulario bloqueó correctamente el guardado sin motivos. Guardó la decisión y el borrador, y ambos reaparecieron al abrir el enlace interno en otra pestaña.

## Casos de uso actuales: qué puede resolver hoy

| Caso de uso real | Resultado de la revisión | Valor actual y límite |
| --- | --- | --- |
| “Tengo una URL y quiero conservarla para evaluarla después” | Funciona | Guarda información básica, fuente y faltantes; el dossier tiene menos contenido útil que la página original. |
| “Quiero comparar dos eventos antes de comprometer presupuesto” | Funciona parcialmente | Permite comparar y registrar preguntas. Hay defectos de costos, audiencia y fechas que debilitan la fiabilidad de la clasificación. |
| “Queremos dejar por escrito una decisión condicional y recuperarla” | Funciona | Es el caso más sólido: memoria de motivos y condiciones con persistencia real. Su utilidad depende de la evidencia ingresada. |
| “Buscame organizadores que ya trabajaron con empresas como la mía” | Solo demostrado con datos preparados | La estructura y matching existen; el catálogo de la sesión no aporta antecedentes comerciales reales suficientes. |
| “Mostrame sponsors, proyectos y qué pasó en ediciones anteriores” | Insuficiente | Los contratos admiten evidencia relacionada, pero el recorrido actual no obtiene ni presenta una investigación real rica de ese tipo. |
| “Recomendame dónde invertir mis USD 5.000” | No acreditado | No hay política comercial aprobada ni cobertura suficiente. La comparación factual no constituye una recomendación de inversión. |
| “Quiero un workshop, stand o sponsorship concreto listo para coordinar” | Parcial | Se crea un borrador con preguntas. La UI no completa de forma práctica modalidad, objetivo confirmado, definición de éxito y compromisos. |
| “Busco contratar buenos ingenieros o generar adopción” | No validado para ese resultado | El objetivo puede registrarse, pero no se demuestra matching ni beneficio específico para contratación o adopción. |
| “Monitoreá nuevos eventos/sponsors y medí resultados” | Fuera del corte implementado | No hay seguimiento automático ni loop de outcomes. No corresponde contarlo como una capacidad actual. |

## Por qué la interfaz se siente mal

El problema visual tiene causas concretas, más allá del gusto:

1. **La respuesta aparece después de la maquinaria.** Cobertura, timestamps, UUIDs, revisiones, pasos y explicaciones técnicas ocupan la parte superior. En la captura automatizada a 1366×900 los primeros resultados comienzan aproximadamente en y=607.
2. **Falta jerarquía entre respuesta, evidencia y auditoría.** Se repiten fuentes y metadatos por claim; cuesta distinguir qué debería importar para este comprador y cuál es la siguiente pregunta relevante.
3. **El texto prioriza contratos internos.** `snapshot`, revisiones, IDs, estados en inglés y fechas ISO requieren esfuerzo de lectura. En algunas vistas de campaña los IDs aparecen donde se espera reconocer el evento.
4. **El espacio no se traduce en claridad.** Hay bloques extensos, contenedores repetidos y explicaciones redundantes. La investigación en progreso ocupa mucho espacio sin transmitir qué se está averiguando que el usuario aún no sabe.
5. **La falta de contenido sustantivo amplifica la sensación de vacío.** Una tarjeta grande con pendientes y fuentes repetidas parece un informe voluminoso, pero responde pocas preguntas.
6. **El enlace al evento existe, pero es difícil de encontrar.** En las importaciones reales apareció dentro del dossier como “Abrir listado”. En los fixtures los enlaces están deshabilitados deliberadamente. La observación del usuario es consistente con la experiencia: la lista no ofrece un acceso claro y uniforme al evento real.
7. **La etiqueta de verificación es ambigua.** Se muestra “Verificado” con fecha y usuario para una importación automática que a la vez aclara que no fue curada. Se puede interpretar como validación humana de hechos que solo se extrajeron.

La evidencia visual está en [capturas de esta revisión](</Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/>). No se realizó validación móvil: los intentos de cambio de viewport en Chrome no se aplicaron. Las capturas manuales son de escritorio; la suite usó 1366×900.

## Revisión de código: eje Standards

El detalle, referencias a reglas y reproducciones está en [standards.md](</Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/standards.md>). Se identificaron seis incumplimientos y una divergencia de arquitectura con efecto funcional:

| ID | Severidad | Hallazgo comprobado | Evidencia |
| --- | --- | --- | --- |
| S1 | P1 | Al guardar campaña, un costo `inferred` o `contradicted` con fuente se convierte en `quoted` | Reproducción del guardado con parsers reales y pool en memoria, sin modificar DB. `decisions/store.ts:158–167`. |
| S2 | P1 | El validador permite narrativa factual sin soporte semántico; una fecha citada basta para aceptar un supuesto precio de 10 USD | Transporte de modelo controlado; no fue una alucinación observada de Gemini en vivo. La UI consume el resumen aceptado. `model-adapter.ts:218–228,357–378`. |
| S3 | P1 | Presupuesto puede resultar elegible con USD 3.000 + USD 3.000 frente a USD 5.000, o perder una partida pendiente o una moneda incomparable | Tres reproducciones puras. `eligibility.ts:213–235`. Se trata del límite inferior de partidas conocidas; no de inventar un total con datos faltantes. |
| S4 | P1 | Un claim de fecha contradicho puede dejar el candidato elegible sin condición temporal | Reproducción pura con revisión válida. `eligibility.ts:106–139`. |
| S5 | P2 | Audiencia pendiente/ausente no genera condición de decisión | Reproducción pura y observación en Chrome con ambos eventos reales. `eligibility.ts:248–260`. |
| S6 | P2 | `confirmed` queda fuera de los estados admitidos por investigación; fortalecer evidencia puede quitar soporte a una edición o a un match | Predicado reproducido; desaparición del único match trazada por código. `research.ts:12,22–27,68–84`. |
| H1 | P2 | Investigación usa el día UTC y comparación el día de la zona declarada | Mismo evento del 1 de octubre en SF queda fuera de la ventana en un camino y elegible en el otro. `research.ts:28–29` frente a `eligibility.ts:48–74,125`. |

Las doce observaciones del script auxiliar incluyen controles y assertions del comportamiento actual. Que ese script termine correctamente significa que reproduce los defectos; no que la app cumpla esos requisitos.

## Revisión de alcance: eje Spec

Este eje distingue cumplimiento del plan de calidad del producto. No suma de nuevo los defectos compartidos con Standards.

- El recorrido principal y la persistencia sí existen. La ausencia de búsqueda web automática y de ranking aprobado forma parte del recorte autorizado.
- La documentación original y los estados de aceptación no están sincronizados; “implementado” y “aceptado por un usuario con datos reales” no son equivalentes.
- Se detectaron diferencias entre lo descrito en el paseo de producto y los controles de la UI: filtros de tema/formato/fecha/verificación, captura de objetivo confirmado/éxito y completado del borrador de campaña.
- La apertura de dossier desde una comparación persistida consulta el catálogo actual. La comparación conserva su snapshot, pero el detalle puede mostrar otra revisión: hallazgo estático; no completé una prueba manual de reimportación para reproducirlo.
- Una importación con ciudad desconocida puede tener dossier durable y quedar fuera de la lista seleccionable de Eventos por el filtro SF: hallazgo de código, relevante para el camino que admite datos pendientes.

Este eje se presenta separado de Standards. La [revisión independiente Spec](</Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/spec.md>) incluye referencias y la matriz de los quince tickets. Ninguna de estas diferencias convierte automáticamente una característica del horizonte original en trabajo ya autorizado para implementar.

## Verificación, límites y trazabilidad

**239 pruebas pasaron; ninguna falló ni fue omitida. ESLint, TypeScript y build de producción también pasaron.** Se ejecutó el código actual, incluidos cambios sin commit, en una copia aislada con PostgreSQL temporal. No se apagó ni se reinició el servidor o la base de desarrollo del usuario.

Desglose: 214 tests unitarios/integración, 11 e2e de investigación SF, 9 de reapertura y 5 de evaluación persistida. El conteo TAP incluye contenedores con subtests. Hay pruebas reales de procesos, DB, RLS y recuperación. Los proveedores y catálogos de esas suites son controlados/sintéticos; no acreditan calidad comercial ni apariencia aceptada.

El [informe de verificación](</Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/verification.md>) explica el aislamiento y dos problemas del montaje temporal resueltos sin cambiar código. No medí cobertura porcentual, rendimiento bajo carga, accesibilidad exhaustiva, operación alojada ni nuevos usuarios reales. La notificación visual de “Borrador copiado” apareció, pero la captura de clipboard quedó vacía: no doy por verificado el contenido copiado.

Pruebas manuales principales, en Chrome y servidor local:

| Recorrido | Resultado |
| --- | --- |
| Perfil → revisar interpretación → investigación → organizador → dossier | Completado; matches sintéticos. |
| Dos URLs públicas → importación durable → dossier | Completado; pérdida de información de las fuentes descrita arriba. |
| Seleccionar ambas → comparación → registrar decisión | Completado; sin score, con condiciones y omisión de audiencia. |
| Guardado sin motivo | Bloqueado correctamente. |
| Guardado QA con condición propia → campaña | Completado. |
| Cerrar pestaña → reabrir enlace de campaña | Conservó decisión, revisión, motivos y preguntas. |

Referencias locales para reproducir la sesión de QA: investigación `b08aec00-3e79-4d53-8fbc-bb3646d328ae`; importaciones `70e00629-8a56-452e-a84c-f5944913c144` y `eb44644f-1038-4a83-9670-d8f336c84248`; comparación `21279a0a-9fe0-4968-b900-29af59463fe6`; decisión `5b4c495c-9957-419e-ba63-06d7ddf2ed15`.

No modifiqué código de aplicación, no hice commits y no contacté organizadores ni autoricé gasto. Las pruebas manuales sí agregaron dos importaciones reales y registros de investigación/comparación/decisión de QA al entorno local. Los cambios de código que ya estaban en el workspace se conservaron.

## Conclusión de producto

El uso defendible hoy es **guardar y recuperar una evaluación condicional de eventos que una persona ya encontró y documentó**. La app todavía no demuestra el caso más ambicioso que se percibe en la idea original: investigar oportunidades y aportar información mejor que la que el usuario conseguiría abriendo unas pocas páginas.

La sensación de poco valor tiene sustento: catálogo de demostración, extracción superficial, antecedentes insuficientes, personalización limitada y una interfaz que hace visible la complejidad interna antes que la respuesta. Esto no borra lo construido; delimita qué parte está funcionando y qué parte aún no se ha conseguido. Las decisiones de producto, rediseño y nuevos planes quedan para el siguiente prompt, como pediste.
