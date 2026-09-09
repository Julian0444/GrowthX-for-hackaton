# Especificación — evaluación persistida de organizadores y eventos de SF

Status: needs-triage

**Estado:** borrador para revisión humana y cruzada. No autorizado para `/implement-spec`.
**Fecha de revisión:** 2026-09-07 · Foco SF y dashboard solicitado por el usuario.
**Resumen y tickets:** [plan consolidado](../../plan/implementation-plan.md).

## Problema

Hoy Growth Atlas puede mostrar mercados en el atlas, abrir un panel de oportunidad y presentar una campaña. También puede extraer una página de Luma. Pero el resultado importado queda en el estado de la pantalla y las decisiones del servidor viven en un `Map`: cerrar la sesión o reiniciar procesos no permite recuperar una evaluación completa y trazable.

Además, la búsqueda actual omite el presupuesto en su clave de cache; algunos recorridos atribuyen señales nacionales a ciudades; un adaptador sustituye fechas ausentes por la fecha actual; y Gemini puede ordenar resultados con `rank` y conservar una explicación con citas sustituidas. Estos comportamientos impiden tratar la pantalla como una decisión de inversión.

La evidencia detallada disponible es una entrevista con Terac: reporta trabajo manual para evaluar eventos y organizadores y valor en recruiting y acuerdos comerciales. Julian reportó nuevas conversaciones el 7 de septiembre sobre dificultad para encontrar organizadores y conocer sus antecedentes; faltan registros para precisar muestra y resultados. Nada de esto demuestra compra ni uso del producto. Este slice comprueba que una evaluación se puede fundamentar, guardar y recuperar; no comprueba todavía que mejore resultados de campañas.

## Autoridad y corte

Entre documentos manda el [ADR 0001, incluidas v1.1 y v1.2](../../docs/adr/0001-arquitectura-agente-growth-atlas.md). El foco actualizado es **evaluación persistida de organizadores y eventos en San Francisco**, con dashboard principal y mapa secundario; termina antes de ejecutar o medir una campaña.

Se leyeron completos [producto de destino](../../plan/finalProduct.md), [casos de uso](../../docs/product/casos-de-uso.md) y [discovery Terac](../../docs/research/discovery-terac-2026-09.md). Del [research](../../docs/research/growth-atlas-agent-architecture.md) se usan únicamente §17 y §18.3, subordinados al ADR y al corte actual.

- El objetivo y su definición de éxito los confirma el comprador. Recruiting es una hipótesis respaldada por lo reportado, no una compra confirmada.
- Los cuatro objetivos del intake no prometen cuatro políticas de evaluación completas.
- Los 136 seeds se congelan como material histórico de prueba. No se habilitan como oportunidades futuras.
- Los casos 2, 3 y 7 son el núcleo: dossier, expediente del organizador y comparación. El caso 1 entra como descubrimiento de organizadores sobre catálogo curado de SF, no búsqueda mundial. Del caso de campaña entra solo el borrador necesario para guardar condiciones y compromisos.
- Las cifras 150→60 y 50%→25% conservan atribución a la entrevista y su independencia no establecida. No generan una reputación automática del organizador.

## Solución y paseo demostrable

La persona entra a un dashboard con navegación lateral izquierda —Resumen, Organizadores, Eventos y Decisiones— y completa producto, audiencia, stack, presupuesto, fechas y el objetivo que está evaluando. SF es el ámbito inicial; puede indicar empresas comparables o competidoras conocidas y confirmar su identidad. Si falta la definición comercial del objetivo, la app lo dice y permite preparar un dossier; no rellena adopción por defecto ni produce una recomendación numérica para una política inexistente.

La investigación devuelve organizadores cubiertos con antecedentes pertinentes, razones por atributo y faltantes. Se puede abrir el expediente de un organizador aunque no haya una alternativa comprable. Cada edición, empresa participante y rol tiene soporte; no se deducen retornos de logos ni afinidad por similitud nominal. Desde una edición futura selecciona eventos para comparar, o pega una URL de Luma en el importador existente. Ve el identificador de la evaluación y pasos cuyo estado viene del servidor. Puede recargar mientras trabaja el worker: la evaluación sigue existiendo.

El panel muestra fecha, lugar, acceso, audiencia, organizador y costos como afirmaciones separadas. Cada una indica de dónde salió, cuándo se obtuvo, qué alcance tiene y qué falta confirmar. Una página que anuncia 150 asistentes respalda una expectativa publicada, no 150 asistentes reales. Una localización nacional no coloca el evento en una ciudad. Si falta ciudad verificable, el dossier sigue accesible en la lista sin un punto inventado en el mapa.

La comparación separa eventos no elegibles, eventos condicionados por información faltante y eventos elegibles. El orden numérico solo aparece cuando existe una política aprobada y versionada aplicable al objetivo; sus valores salen del scorer. Una redacción opcional explica los mismos hechos sin modificar puntuaciones ni condiciones.

La persona elige, descarta o deja pendiente una alternativa, registra por qué y qué respuesta del organizador cambiaría su decisión. Si elige con condiciones, sigue viendo «elección condicional». La vista de campaña conserva la modalidad, costos conocidos y pendientes, preguntas y un borrador de compromisos. Guardar no envía mensajes ni contrata nada.

Cierra el panel o la pestaña, vuelve al dashboard y abre su evaluación guardada desde la lista o su enlace interno. Recupera los mismos identificadores, evidencia revisada, política, resultado y motivos. Una nueva evaluación con datos actualizados crea otra versión; no reescribe silenciosamente la anterior.

## Historias de usuario

1. Como responsable de growth, quiero guardar mi perfil con presupuesto y objetivo explícitos para que otra consulta no reutilice la evaluación de un presupuesto diferente.
2. Como responsable del piloto, quiero distinguir un objetivo confirmado de uno provisional para no presentar como comprado lo que solo apareció en discovery.
3. Como persona que evalúa un evento, quiero pegar su URL de Luma y recuperar después el dossier aunque cierre el navegador.
4. Como persona que busca organizadores, quiero encontrar antecedentes pertinentes dentro de la cobertura de SF y saber cuándo se verificaron sus 2–5 eventos futuros iniciales.
5. Como evaluadora, quiero abrir la evidencia de cada dato material y ver campos pendientes en lugar de ceros o fechas inventadas.
6. Como evaluadora, quiero distinguir lo anunciado por el organizador de lo observado o confirmado por otra fuente.
7. Como evaluadora, quiero abrir un expediente propio del organizador con ediciones, empresas y roles; sus afirmaciones mantienen alcance y no forman un puntaje universal de reputación.
8. Como responsable de presupuesto, quiero que una incompatibilidad confirmada excluya el evento antes de puntuarlo y que un costo desconocido permanezca pendiente.
9. Como evaluadora, quiero comparar hasta tres candidatos sobre la misma versión del perfil y saber cuándo falta una política para ordenarlos.
10. Como responsable de la decisión, quiero registrar elección, descarte o pendiente, con motivos y condiciones cuya resolución podría cambiar la decisión.
11. Como responsable de la campaña, quiero conservar un borrador con costos y compromisos diferenciados sin activar una campaña externa.
12. Como usuaria que regresa, quiero recuperar la decisión exacta y distinguir esa lectura de una reevaluación con nueva evidencia.
13. Como operadora, quiero que la caída y recuperación del worker no pierdan el run ni dupliquen sus efectos persistidos.
14. Como miembro del tenant real, quiero que perfiles, fuentes, runs y decisiones del tenant señuelo sean inaccesibles por URL, API, jobs y consultas SQL de aplicación.
15. Como growth, quiero pasar de una empresa comparable a su edición y rol documentado sin asumir que su participación fue exitosa.
16. Como growth, quiero distinguir lo prometido, lo reportado sobre ejecución y el resultado comercial conocido; la ausencia de datos no significa fracaso.
17. Como usuaria, quiero completar investigación y decisión desde el dashboard sin abrir el mapa; si lo abro, solo sitúa eventos de SF con ubicación respaldada.

## Decisiones de implementación propuestas

### Límites y interfaces

Se conserva el monolito TypeScript: Next.js atiende UI y API; un proceso Node separado ejecuta un workflow fijo con pg-boss; PostgreSQL guarda los datos de negocio y la cola. No se introduce un framework de agentes. Para este slice, la capacidad de investigación se limita a la URL de Luma aportada y las fuentes curadas; no hace búsqueda adaptativa.

Las operaciones del módulo son `startEvaluation`, `getEvaluation`, `listEvaluations`, `getOrganizerDossier`, `saveDecision` y `getDecision`. `startEvaluation` admite tres entradas: investigación sobre catálogo según perfil, selección de IDs de eventos o URL Luma. El descubrimiento acotado y la comparación comparten evidencia, no se convierten en agentes separados. Todas reciben contexto de tenant obtenido en el servidor, nunca aceptado como autoridad desde el cuerpo de la petición.

Propuesta de frontera HTTP, para revisar junto con los contratos:

| Entrada | Comportamiento |
| --- | --- |
| `POST /api/evaluations` | Valida perfil y modo investigación de catálogo, selección de eventos o URL; persiste aceptación e idempotencia; responde 202 con `runId` y URL de consulta. |
| `POST /api/events/ingest` | Conserva la entrada del importador actual y delega en la misma operación durable para Luma. Cliente y ruta cambian juntos; no quedan dos motores de importación. |
| `GET /api/evaluations/:id` | Devuelve progreso real, dossier y snapshot disponibles, con errores y pendientes tipados. |
| `GET /api/evaluations` | Lista investigaciones y evaluaciones del tenant, filtrables por perfil, con acceso a la decisión guardada. |
| `GET /api/organizers/:id` | Lee expediente del organizador con revisiones y antecedentes del tenant; no consulta fuentes nuevas al abrir. |
| `POST /api/decisions` | Guarda la primera decisión contra un snapshot existente y, si corresponde, su borrador de campaña. |
| `GET /api/decisions/:id` | Sustituye la lectura en memoria para este recorrido por una lectura persistida y autorizada. |
| `PATCH /api/decisions/:id` | Agrega una revisión con control de concurrencia; conserva las anteriores. |

`POST /api/opportunities/search` queda como frontera de v0 para caracterización y comparación. El recorrido de evaluación persistida no depende de su cache, sus refrescos silenciosos ni sus fallbacks a seeds. El dashboard consume la proyección persistida, reutiliza panel/fuentes/importador y presenta el mapa solo como opción local de Eventos. No hay obligación de preservar el rail de mercados mundiales ni su pantalla de entrada.

### Contratos y datos

Usar contratos TypeScript y validación de runtime en escritura, lectura y mensajes de jobs. Tipar JSONB sin validar no cumple.

| Objeto | Contenido mínimo e invariantes |
| --- | --- |
| Perfil versionado | Producto, audiencia, stack, empresas comparables/competidoras indicadas y confirmadas por el cliente, objetivo y estado de confirmación, definición de éxito textual opcional, presupuesto y moneda, ventana de fechas y restricciones. Ausente no equivale a cero; no hay objetivo implícito. |
| Organizador y relaciones | Identidad estable y aliases confirmados; ediciones que organiza o coorganiza, con rol y evidencia. No fusionar homónimos por similitud de nombre. |
| Empresa y participación | Empresa identificada, edición, rol documentado, fuente y estado. Competencia/afinidad propuesta se confirma; logo ambiguo no equivale a patrocinio pagado. |
| Antecedente y resultado reportado | Claim de una edición pasada, con autor de declaración, objetivo, período y método si existen. Se puede consultar fuera de SF, con localización explícita; no entra como oportunidad futura ni alimenta ingesta de outcomes. |
| Evento y revisión | Identidad interna, URL canónica admitida, proveedor, revisión y claims; fecha con zona o ambigüedad explícita. La ciudad solo se usa como ubicación factual cuando está respaldada. |
| Fuente | URL y localizador, proveedor distinto de colector, fecha de obtención distinta de publicación y del evento, extracto permitido o hash, método, alcance geográfico, base y restricciones de uso conocidas. Público no equivale a licencia de republicación. |
| Claim y revisión | Sujeto, atributo, valor/unidad, estado —anunciado, reportado, observado, inferido, confirmado, pendiente o contradicho—, evidencia vinculada, método de extracción/verificación, revisor y revisión anterior. Observar que una fuente reporta un resultado no verifica el resultado; una inferencia nunca se promociona por votos. |
| Run y step | Tenant, perfil, fuentes solicitadas, estado, intentos, claves idempotentes, entradas/salidas referenciadas, tiempos, error, versiones de workflow/contratos/modelo y correlación. |
| Snapshot inmutable | Tipo investigación/comparación; perfil y revisiones de organizadores, relaciones, eventos/claims; instante de evaluación; elegibilidad y motivos; política y features; score/cobertura/sensibilidad cuando procedan; orden oficial; condiciones, citas admitidas y estado de redacción. |
| Decisión y revisiones | Snapshot, alternativa, elegir/descartar/pendiente, motivos, autor del servidor, fecha, condiciones, revisión anterior. Descarte no es outcome negativo; elegir no cambia la evidencia. |
| Campaña en borrador | Decisión de origen, objetivo, modalidad, partidas de costo y faltantes, preguntas y compromisos con tipo estimación/objetivo/acordado, responsable, plazo, método y evidencia de confirmación. Sin ejecución ni resultados. |

Se proponen tablas relacionales para tenants, pertenencias, runs/steps, organizadores, empresas, relaciones por edición, eventos/revisiones, fuentes/claims, snapshots, decisiones/revisiones y campañas. Perfil, payload de snapshot y borrador de campaña pueden ser JSONB validado. Identificadores, tenant, versiones y relaciones críticas permanecen en columnas con claves y restricciones.

En este slice también el catálogo curado se materializa bajo el tenant: no se diseña un catálogo global compartido ni una excepción de permisos implícita. Las referencias compuestas impiden enlazar un claim de otro tenant. RLS y pruebas usan roles reales de aplicación sin privilegios de propietario ni bypass; cada transacción fija su contexto de tenant y lo limpia al volver al pool. El rol que administra pg-boss no sirve consultas de usuario; el worker usa acceso de negocio limitado al tenant del run resuelto por el servidor.

### Estados, publicación y recuperación

Estados de run: en cola, en ejecución, completado o fallido. Estados de step: pendiente, en ejecución, completado o fallido, con intentos y lease. Un run completado puede contener un dossier insuficiente; eso no significa que el evento sea elegible. Las condiciones pendientes y las decisiones humanas tienen estados de negocio separados.

Secuencia: validar entrada → recuperar candidatos del catálogo cuando se investiga por perfil → obtener fuentes permitidas → normalizar/versionar claims → evaluar elegibilidad → puntuar si hay política aplicable → guardar snapshot oficial → producir redacción opcional validada → publicar lectura. La decisión humana de inversión ocurre después, mediante una operación transaccional propia. Guardar un organizador como candidato de investigación no equivale a elegir una inversión: todavía puede faltar una edición o propuesta.

El snapshot numérico y sus fuentes no se modifican por la redacción. El resultado del modelo se guarda separado, ligado al snapshot; puede fallar y dejar una explicación determinística visible.

La aceptación del run debe quedar atómica respecto de un trabajo durable: usar integración transaccional de pg-boss con la versión fijada y demostrarla. Si esa integración no resulta viable, registrar en la misma transacción una salida pendiente en PostgreSQL y despacharla idempotentemente; esa alternativa solo resuelve la atomicidad, no cambia de cola ni introduce otra base.

Cada step confirma sus resultados y su avance de forma transaccional. Hay restricciones únicas para sus efectos. Se asume que un trabajo puede entregarse otra vez: no se promete «exactamente una vez» para una llamada HTTP al proveedor. Reiniciar puede repetir una lectura o una llamada al modelo no confirmada; no debe duplicar eventos lógicos, snapshots publicados ni decisiones. Reintentos tienen límites y fallos persistidos visibles.

Una clave de idempotencia se limita al tenant y operación. Repetirla con el mismo payload devuelve el mismo recurso; reutilizarla con otro payload devuelve conflicto. Guardar una decisión usa también la revisión esperada para evitar sobrescrituras entre pestañas.

### Selección de organizadores, elegibilidad, orden y modelo

El matching inicial usa filtros estructurados del catálogo y relaciones respaldadas: tema/stack, audiencia declarada con su estado, formato y ediciones. Devuelve razones por atributo y cobertura, no un índice de confianza de organizador. SQL basta para filtrar y recuperar este conjunto pequeño. Un LLM puede proponer interpretación del perfil para revisión; no inventa roles o rivales comerciales. Si no hay coincidencias, se informa el límite del catálogo.

Toda empresa listada permite recorrer empresa → edición → rol → evidencia. Repetición significa participación documentada en varias ediciones; exclusividad temática y comercial se distinguen. Se separan tres niveles de información: anuncio, ejecución reportada y resultado del sponsor. Un resultado comercial desconocido no se estima desde asistencia, proyectos o marcas.

SF se aplica a la edición futura evaluada, no al domicilio inferido del organizador. Un evento fuera de SF o sin ubicación verificable puede leerse como antecedente/pendiente, pero no se presenta como oportunidad local elegible.

Fecha vencida o incompatibilidad confirmada con las restricciones excluyen antes del score. Fecha ambigua, acceso desconocido o costo total incompleto dejan condiciones pendientes; no se transforman en elegibles por un puntaje alto. Una estimación de presupuesto distingue cada partida conocida de lo que falta: no suma faltantes como cero.

La política versionada define dimensiones, normalización, pesos, cobertura y desempate. Mostrar `S_known`, `Q` y sensibilidad si existe política aprobada; no denominarlos probabilidad de éxito. Sin política, comparar datos y condiciones sin orden de mérito numérico. La pantalla debe diferenciar ese orden de presentación de un ranking.

v0 se compara en modo sombra sobre entradas congeladas y compatibles, sin nuevas consultas externas. Sus dimensiones de comunidad/tema/mercado no se hacen pasar por score de un evento o por un objetivo de recruiting. Las incompatibilidades se registran como no comparables.

El adaptador de modelo recibe solo claims seleccionados del snapshot. Puede seleccionar referencias para una explicación o proponer texto como borrador, pero no crear hechos publicables, score, rank, eligibility ni condiciones oficiales. Los hechos visibles se componen desde valores admitidos y plantillas; texto libre sin soporte verificable no se publica como razón factual. Comprobar que existe un ID no demuestra que el texto esté respaldado. Nunca se sustituyen las citas de una narrativa rechazada conservando esa narrativa.

### Seguridad y observabilidad mínimas

La importación reutiliza el alcance Luma existente: HTTPS, hosts permitidos, validación de cada redirección, límites de tamaño/tiempo y rechazo de destinos no admitidos. No descarga recursos enlazados ni evita autenticación. El HTML y las respuestas del modelo son datos no confiables; las instrucciones contenidas en una descripción de evento no pueden cambiar herramientas, tenant, scoring o política.

Sesión autenticada y pertenencia resuelta en servidor para todas las rutas de negocio; autorización también en el worker. No hay roles de organizador autodeclarados ni votos que suban confidence. Logs estructurados enlazan tenant, run, step, intento y snapshot; guardan duración, estado, proveedor/modelo, uso/costo cuando disponible y motivo de degradación. No vuelcan credenciales, páginas completas ni prompts privados. Si no se conoce un costo, queda desconocido, no cero. No se crea una plataforma de observabilidad aparte.

## Decisiones de prueba

Se conserva `node:test` para unidades y contratos. Las pruebas de repositorio, transacciones, RLS y jobs usan PostgreSQL real y pg-boss real con procesos separados de Next y worker. Las pruebas de navegador incorporan Playwright para demostrar la UI existente con esas APIs; no se simula la base ni la cola en la aceptación de durabilidad.

Los proveedores se sustituyen por respuestas HTML/modelo controladas en CI; nunca se necesitan claves pagadas para demostrar el slice. Un reloj inyectable fija fechas y permite repetir límites de vigencia. El smoke manual con Luma real se distingue de la prueba reproducible y requiere reverificar el catálogo antes de mostrarlo como futuro.

La suite de aceptación cubre descubrimiento SF sin mapa, organizadores homónimos, roles ambiguos, empresas comparables, resultado desconocido, los cinco defectos de v0; esquema inválido; claims contradictorios; costos desconocidos; catálogo y URL; autoridad del modelo; guardar y reabrir; sesión de otro tenant; concurrencia e idempotencia; caída antes y después de commits; error del modelo y de importación. El detalle y su ticket responsable están en el plan consolidado.

## Fuera de alcance

No hay ingesta de outcomes ni CSV, cohortes, activación o retención medidas, atribución ejecutada, ROI observado, aprendizaje automático, episodios de resultados o promoción de patrones. Tampoco radar de sponsors, buzz/momentum social, lado organizador, contactos cálidos/social graph, multiagente, pgvector, ejecutor externo ni scraping de nuevas fuentes.

Sí se cambia la entrada a dashboard y la navegación para investigar organizadores. Se reutilizan componentes; no se construye un sistema visual completamente distinto ni un producto completo de gestión de campañas. No se construye soporte comercial completo para los cuatro objetivos del intake, un sistema de billing o administración de organizaciones. La autenticación mínima para proteger el tenant sí es requisito.

## Decisiones abiertas y revisión

- **DECISIÓN ABIERTA D1 — comprador y objetivo:** quién usa el tenant real, qué decisión compra y cómo define éxito. Permite probar con perfiles ficticios explícitos; bloquea declarar un piloto comercial acordado.
- **DECISIÓN ABIERTA D2 — política del objetivo:** criterios de acceso, costo y audiencia y, si se requiere ranking, dimensiones/pesos/umbrales aprobados. Permite dossier y comparación factual; bloquea publicar un score de inversión para ese objetivo.
- **DECISIÓN ABIERTA D3 — acceso del tenant real:** identidad, pertenencia y mecanismo de autenticación que se usará en la demo compartida. Bloquea habilitar datos reales o acceso compartido; una identidad inyectada solo sirve dentro de tests.
- **DECISIÓN ABIERTA D4 — cobertura:** cuáles son las 2–5 URLs futuras de SF, sus organizadores y antecedentes históricos pertinentes, quién los verifica y qué material se puede conservar/mostrar. Debe haber al menos dos organizadores distintos para demostrar descubrimiento y comparación; si no se consiguen, se declara insuficiencia del catálogo. Bloquea afirmar que existe catálogo real verificado; fixtures solo prueban el mecanismo.
- **DECISIÓN ABIERTA D5 — operación del piloto:** dónde corren PostgreSQL y el worker persistente y quién tiene acceso operativo. No cambia la arquitectura ni bloquea pruebas locales; bloquea dar por aceptada una instalación compartida.

No se agrega un ticket de outcomes para resolver D1. Definir una métrica como texto no implementa su medición. La revisión de fuentes está en [fuentes para organizadores de SF](../../docs/research/fuentes-organizadores-sf-2026-09.md); Devpost, GitHub, recaps y webs de sponsors aportan referencias manuales, no conectores nuevos en este slice.

El cierre técnico puede mostrar una decisión condicional sin score si D2 sigue pendiente; el cierre con datos reales requiere D3 y D4. Ningún ticket se considera listo para implementar hasta la revisión humana y cruzada del conjunto.
