# Fuentes para investigar organizadores de eventos en San Francisco

Fecha de consulta: **2026-09-07**. Investigación documental con fuentes primarias; no se recolectó un catálogo, no se ejecutó scraping ni se contactó a organizadores. Los ejemplos históricos ilustran qué puede sostener una fuente: no son recomendaciones de inversión ni oportunidades vigentes.

**Recomendación:** empezar por expedientes de organizador y evento que respondan «qué antecedentes pertinentes encontramos, quién los afirma y qué falta confirmar antes de patrocinar». El producto puede reducir investigación y hacer visibles las incertidumbres. Las fuentes consultadas no justifican prometer que conoceremos el ROI de cualquier competidor ni que podremos certificar la confiabilidad global de un organizador.

## El dolor al que deben servir las fuentes

**Evidencia interna:** Terac describe una comprobación manual de organizadores, asistencia y audiencia antes de patrocinar; también reporta diferencias entre expectativas y resultados. Son declaraciones de una entrevista, sin independencia establecida entre los dos ejemplos cuantitativos y sin validación de disposición a pagar. El objetivo comercial debe acordarse con el comprador; recruiting y enterprise deals aparecen en esa conversación. [Registro de discovery](./discovery-terac-2026-09.md).

**Inferencia de producto:** el expediente debe distinguir tres preguntas: «¿organizó algo parecido?», «¿hay evidencia de que ocurrió y qué produjo?» y «¿produjo el resultado comercial que mi empresa busca?». Una respuesta positiva a la primera no responde las otras dos.

## Fuente → afirmación → límite → acceso

| Fuente primaria | Afirmación que puede sostener | Lo que no prueba | Acceso y uso propuesto |
|---|---|---|---|
| Página pública de evento y calendario de Luma | Identidad anunciada, fecha, formato, lugar publicado y roles visibles. Luma permite separar presencia pública y acceso de gestión; un calendario puede presentar una organización. [Hosts y managers](https://help.luma.com/p/adding-hosts-and-managers-to-your-event). | Un nombre visible no demuestra responsabilidad contractual, asistencia efectiva ni resultados comerciales. | Ahora: URL aportada por el usuario y comprobación del contenido accesible. Guardar el rol tal como aparece; si resulta ambiguo, dejarlo pendiente. No incorporar información privada. |
| Gestión y API oficial de Luma | Registros y estados de inscripción; el sistema distingue aprobación y check-in por ticket. [Gestión de invitados](https://help.luma.com/p/managing-your-guest-list). | «Going» no equivale a presencia comprobada. Un check-in no demuestra seniority, activación, contratación o venta. | Futuro, con autorización: conexión al calendario del titular. La API requiere Luma Plus y una clave por calendario que concede acceso completo a ese calendario. No asumir permisos solo de lectura ni acceso universal. [API](https://docs.luma.com/reference/getting-started-with-your-api). |
| Galería pública de Devpost | Proyectos presentados y publicados tras moderación; los ganadores pueden identificarse en la galería. [Funcionamiento de la galería](https://help.devpost.com/article/80-what-is-the-project-gallery). | No es censo de asistentes, prueba automática de funcionamiento del software ni adopción posterior. Una galería incompleta tampoco demuestra ausencia de proyectos. | Ahora: enlaces de referencia aportados o revisados por una persona; no extracción sistemática. Antes de almacenar contenido o integrar una fuente automatizada, resolver permisos específicos; sus términos restringen scraping y reutilización. [Términos](https://info.devpost.com/legal/terms-of-service). |
| Anuncio oficial de organizador, empresa o sponsor | Participación y aportación descritas explícitamente: organiza, presta sede, aporta créditos, juzga o patrocina. Un anuncio de Supabase distingue esos papeles en un hackathon de SF. [Anuncio de 2024](https://supabase.com/events/supabase-ai-hackathon-at-y-combinator). | Un logo no acredita pago, monto, exclusividad ni satisfacción. Estar listado junto a una empresa no establece una relación comercial entre ambas. | Ahora: antecedentes curados, con fuente y fecha; transcribir el papel declarado. Una automatización futura necesita condiciones de uso verificadas por sitio. |
| Recap publicado por el organizador o sponsor | Resultados que esa entidad reporta: asistentes, demos, premios o participación de su equipo. Supabase publicó un balance con asistentes y proyectos. [Recap](https://supabase.com/blog/ai-hackathon-at-y-combinator). | Es una fuente interesada; el relato no constituye auditoría independiente ni demuestra beneficio económico incremental. Dos publicaciones que reutilizan el mismo reporte no son dos mediciones. | Ahora: registrar cada cifra como reportada, con definición y método si están publicados. Si faltan, indicarlo. No copiar galerías completas, fotografías o testimonios sin base de uso. |
| Repositorio GitHub enlazado desde un proyecto concreto | Existencia de código accesible y actividad registrada en ese repositorio; GitHub documenta qué cuentan y excluyen sus estadísticas. [Actividad de repositorios](https://docs.github.com/en/rest/metrics/statistics). | Commits, estrellas o menciones de una tecnología no prueban uso real, retención, asistentes de SF ni ROI del sponsor. | Ahora: enlace pertinente y revisión acotada del artefacto. Integración futura solo si aporta una comprobación útil. Público no significa licencia abierta de reutilización. [Licencias](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository). |

## Un ejemplo real que muestra la diferencia

**Evidencia externa:** Supabase anunció un hackathon para el 22–23 de noviembre de 2024 en San Francisco: Supabase organizaba, YC ofrecía la sede y Anthropic aportaría créditos. El recap del 20 de diciembre reportó más de 150 personas y 47 proyectos preparados para presentar. Se pueden registrar papeles y cifras atribuidas a Supabase; no convertir los créditos en gasto monetario de patrocinio. [Anuncio](https://supabase.com/events/supabase-ai-hackathon-at-y-combinator), [recap](https://supabase.com/blog/ai-hackathon-at-y-combinator).

**Inferencia:** esto permite decir «hay un antecedente de un encuentro de construcción con esta tecnología y estos colaboradores». Esas publicaciones no aportan costos totales, contrataciones atribuibles, cuentas retenidas ni ingresos posteriores: «el patrocinio tuvo éxito comercial» permanece sin demostrar. Tampoco basta para recomendar ese organizador a cualquier producto.

**Recomendación:** la repetición de una empresa en varios eventos debe mostrarse como una secuencia de participaciones documentadas, con fechas y roles. Solo se vuelve evidencia de satisfacción o renovación por resultados si existe una declaración o dato que sostenga específicamente esa interpretación.

## Qué pedir cuando la web no alcanza

**Recomendación para el dossier:** convertir los huecos en preguntas concretas que el equipo pueda llevar al organizador. No enviar mensajes desde la app en este slice.

- **Audiencia:** cuántos inscritos, aprobados y asistentes efectivos; cuándo se midieron, con qué método y sobre qué población. Una lista pública puede ocultarse y no garantiza cobertura completa. [Visibilidad en Luma](https://help.luma.com/p/event-guest-list).
- **Afinidad:** qué datos respaldan experiencia técnica, uso del producto o capacidad de compra. La descripción promocional de la audiencia debe quedar como declaración; no deducir seniority de fotografías, nombres o número de proyectos.
- **Condiciones comerciales:** cash, créditos, premios y otros costos por separado; acceso ofrecido al equipo, disponibilidad del paquete y restricciones de exclusividad. Una página general del evento no confirma un acuerdo particular.
- **Resultados anteriores:** para qué sponsor, con qué objetivo, ventana temporal y método de atribución. Registrar «no publicado» cuando falta; no sustituirlo por cero, una estimación del modelo o un puntaje de reputación.

Estas preguntas ordenan la decisión previa a invertir; no incorporan ingesta de outcomes, cohortes ni medición automática al primer slice.

## Procedencia y límites de reutilización

**Recomendación:** cada afirmación debe conservar entidad y evento al que se refiere, autor de la declaración, URL, localizador, fecha del evento, fecha de consulta, valor, unidad, método conocido y estado: reportada, corroborada con alcance explícito, contradictoria o pendiente. Añadir relación entre fuentes para reconocer un mismo comunicado replicado. «Observamos una afirmación en una web» y «verificamos lo afirmado» son estados diferentes.

Luma atribuye la información del evento al host y restringe acceso a interfaces públicamente soportadas; sus términos no conceden autorización general para republicar contenido. **DECISIÓN ABIERTA:** validar qué contenido puede almacenar y mostrar comercialmente el importador existente; conservar como alternativa enlaces y datos aportados con autorización. La lectura técnica de una URL no resuelve derechos de reutilización. [Términos de Luma](https://luma.com/terms).

Devpost distingue derechos de participantes, plataforma y responsables del hackathon; no asumir que Growth Atlas recibe los permisos concedidos a esos actores. **Recomendación:** no crear un conector Devpost en este slice ni copiar perfiles o galerías; resolver el permiso antes de una integración posterior. [Términos de Devpost](https://info.devpost.com/legal/terms-of-service).

## Decisión para el primer slice y límites de esta investigación

Usar **2–5 eventos futuros de SF verificados manualmente**, con antecedentes curados de sus organizadores y compañías participantes. Ofrecer búsqueda dentro de ese catálogo, comparación de expedientes y decisiones condicionales. El mapa local ayuda a localizar un evento; la evidencia y las condiciones pendientes deben ocupar el centro de la decisión. Los antecedentes históricos nunca entran como oportunidades futuras.

No se comprobó cobertura suficiente para un catálogo exhaustivo, integraciones autenticadas, exactitud de los recaps ni disponibilidad real de datos privados. Las antiguas rutas individuales de la API de Luma no se pudieron verificar; la documentación introductoria actual sí confirma alcance y permisos. No se verificó un endpoint público que resuelva descubrimiento global de organizadores. El valor que debe probarse primero es si este expediente reduce incertidumbre y trabajo antes de decidir, incluso cuando algunos resultados permanecen desconocidos.
