# Propuesta: una investigación que cambia una decisión de growth

Estado: propuesta para discutir; no implementada. Fecha: 9 de septiembre de 2026, noche en Los Ángeles. Basada en la auditoría del código y las pruebas reales de la app. No reemplaza todavía el ADR ni los tickets anteriores.

## Apuesta de producto

Growth Atlas ayuda a un equipo de growth a decidir dónde y cómo acercarse a su audiencia: encuentra oportunidades, reconstruye antecedentes verificables y explica qué inversión merece explorarse, cuál descartar y qué información falta para comprometer presupuesto.

El primer comprador será una startup B2B de herramientas para desarrolladores. El primer canal será eventos, workshops y comunidades técnicas de San Francisco. Es un punto de entrada concreto al problema amplio de decisiones de growth; la arquitectura se puede ampliar después de demostrar utilidad aquí.

La salida principal debe ser un brief de decisión que responda cinco cosas:

1. Qué oportunidad tiene sentido para el producto y objetivo declarado.
2. Qué evidencia la distingue de las otras opciones.
3. Qué actividad podría realizar la empresa allí, separando oferta publicada de idea propuesta.
4. Qué presupuesto está documentado, qué falta cotizar y qué condiciones cambian la decisión.
5. Qué hacer a continuación y qué fuente permite comprobar cada afirmación.

La tesis a probar es que podemos ahorrar investigación manual y detectar un ajuste o riesgo que una lectura superficial omite. Aún no tenemos evidencia para prometer más ventas, contrataciones o ROI.

## Restricción real de la postulación

La [página oficial de Puentes](https://puentes.antigravity.capital/) indica cierre el 10 de septiembre a las 20:00 PT y revisión técnica de un repositorio en la segunda ronda. El [formulario](https://antigravity-room.notion.site/625daeb2902683fa8c69819d21c7b20a), consultado en Chrome, solicita un video en inglés de hasta dos minutos, mediante YouTube o Loom; también pide explicar un proyecto reciente y cómo se construyó.

Al verificarlo quedaban aproximadamente 21 horas y media. La propuesta distingue una entrega acotada para ese video de una ampliación posterior. No promete construir toda la visión antes del cierre.

## El recorrido que queremos mostrar

Caso de demostración, expresamente hipotético como comprador: una empresa de observabilidad para agentes, SDK Python/TypeScript, presupuesto de USD 5.000, interesada en conseguir equipos que prueben el producto.

La empresa ingresa su sitio o descripción, audiencia, presupuesto y objetivo. La app propone una interpretación editable, encuentra oportunidades y profundiza en tres. Si la búsqueda encuentra menos opciones con evidencia suficiente, muestra menos.

La pantalla principal presenta:

- Nombre y enlace directo al evento, organizador identificado por su rol, fecha y ubicación.
- Una razón específica de pertinencia para este producto.
- Audiencia anunciada frente a evidencia de actividad pasada.
- Sponsors y empresas vinculadas, con edición, rol y fuente.
- Proyectos o recaps asociados, cuando existan, y qué aportan a la hipótesis de afinidad.
- Condición que impide decidir ahora y la siguiente acción útil.

El momento central del video tiene que ser un hallazgo comercialmente útil. Ejemplo del **tipo de hallazgo buscado, aún no encontrado ni garantizado**: el organizador ha realizado workshops de un formato pertinente y una galería de la misma edición muestra proyectos que usan tecnologías compatibles con el producto. Eso apoya explorar un workshop técnico; no demuestra asistentes compradores ni que un patrocinio haya funcionado.

La contradicción real de fechas detectada en la auditoría sirve para enseñar manejo de incertidumbre. Por sí sola no basta como propuesta de valor: hace falta al menos un antecedente positivo que ayude a elegir dónde investigar.

## Qué investigación incorporamos

**Exa: descubrir fuentes con una pregunta concreta.** Consultas por oportunidad, organizador, edición previa, empresa comparable y proyectos. Primera búsqueda de candidatos; después profundización de hasta tres. Buscar evidencia favorable y también hechos que invaliden la hipótesis. El nombre de una ciudad en una consulta no acredita la ubicación de sus resultados.

**Lectura completa: extraer lo que hoy perdemos.** Primero contenido de páginas conocidas mediante fetch/Exa Contents. Usar Apify cuando haga falta renderizado o navegación por un conjunto pequeño de páginas vinculadas. [Exa Search](https://exa.ai/docs/reference/search) permite búsqueda y extracción; [Contents](https://exa.ai/docs/reference/get-contents) permite recuperar texto y controlar frescura con `maxAgeHours`. No usar el parámetro obsoleto `livecrawl` como garantía de una lectura nueva.

**Apify: obtención dirigida.** Primer candidato: [Website Content Crawler, mantenido por Apify](https://apify.com/apify/website-content-crawler), para páginas de organizadores, recaps y galerías públicas. Un crawler obtiene texto; nuestra lógica todavía debe extraer roles, asociar la edición correcta y comprobar soporte.

**X y LinkedIn: fuentes posibles de antecedentes.** Una publicación del organizador o de una empresa puede aportar un anuncio, recap, modalidad o participación que falta en la web. Se buscarían cuentas/publicaciones relacionadas con las entidades del dossier y un período concreto. El Actor se elige después de probar calidad y costo sobre una muestra pequeña; no está validado por tener un conector anterior. No depender del scraping social para cerrar el video. No hacen falta perfiles privados, listas de personas ni un feed de popularidad para este caso.

**Resolución y evidencia propias.** Cada extracción conserva URL, fragmento exacto, fecha de obtención, entidad/edición, atributo y estado. Separar organizador de calendario, host, sponsor y venue; distinguir ediciones por identidad, fecha y enlaces, sin fusionarlas solo por nombre. Las inferencias se presentan como tales. Encontrar la palabra correcta en una página no valida cualquier frase que la cite.

**Síntesis orientada al comprador.** Usar producto, objetivo y restricciones para explicar afinidad técnica, formato y riesgos. La recomendación de qué investigar primero será una interpretación trazable; elegibilidad, fechas y restricciones monetarias seguirán reglas verificables. No publicar porcentajes de éxito ni un score de inversión sin base. Si se propone una actividad que no está ofrecida, etiquetarla como idea a consultar.

## Entrega para el cierre: seis bloques con criterios de salida

Las horas son estimaciones de esfuerzo, no un compromiso de finalización. Datos y presentación pueden avanzar en paralelo después de fijar el contrato. Cualquier bloque que incumpla su criterio reduce el alcance de la demo; no se reemplaza con datos inventados.

| Bloque | Entregable | Criterio de salida | Estimación |
| --- | --- | --- | --- |
| 1. Encontrar la historia real | Tres oportunidades; dos organizadores con antecedentes públicos si las fuentes lo permiten; un hallazgo que cambie la investigación | Abrir las fuentes y comprobar que aportan más que título/fecha. En 60–90 minutos decidir si este caso de comprador produce evidencia suficiente | 1–2 h |
| 2. Proteger la decisión | Corregir costos, estados y contradicciones del recorrido elegido; narrativa factual restringida a campos respaldados | Un costo incierto no se vuelve cotización; partidas acumulables, moneda y faltantes conservan sus restricciones; audiencia pendiente y fecha contradicha siguen visibles | 2–4 h |
| 3. Investigar de verdad | Un paso durable nuevo con Exa sobre candidatos/URLs y extracción completa; Apify solo si una fuente decisiva lo necesita | Una investigación real produce fuentes y claims nuevos persistidos, con límites de consultas/páginas, fallos explícitos y costo trazado | 3–5 h |
| 4. Pantalla de decisión | Brief compacto + tres alternativas + evidencia lateral + guardar decisión | Nombre, razón, riesgo y enlace visibles sin abrir un dossier largo. La UI usa datos del servidor, incluidos estados de carga y faltantes | 3–5 h, en paralelo |
| 5. Integración y ensayo | Recorrido completo con fuentes reales y revisión manual de afirmaciones | Fuente → hecho → explicación → condición → decisión → reapertura; cada transición conserva la misma evidencia | 2–3 h |
| 6. Video y presentación | Video inglés ≤120 s; README coherente; enlace al repo; demo accesible o grabación local real | Ensayo cronometrado y reserva de tiempo para subir/verificar el video y completar el formulario | 2 h reservadas |

Al cerrar el primer bloque, si no aparecen antecedentes suficientes, cambiar el ejemplo de comprador/organizador o acotar el video a las oportunidades con evidencia disponible. No dedicar la noche a enriquecer tres nombres elegidos por estética.

Antes de grabar, congelar funcionalidades. Si la búsqueda amplia sigue incompleta, demostrar investigación real sobre URLs elegidas, explicándolo. Si el despliegue no está listo, grabar el funcionamiento local y mostrar un repositorio reproducible; no inventar una operación alojada. La postulación admite un video, por lo que un despliegue nuevo no debe consumir la reserva final.

## Interfaz propuesta

Una pantalla principal de investigación con tres zonas:

1. **Brief del comprador:** producto, objetivo, audiencia y presupuesto; interpretación editable.
2. **Alternativas comparables:** fila/tarjeta compacta por evento, fecha, host, razón de interés, antecedente, costo/pendiente y botón visible “Abrir evento”.
3. **Lectura de decisión:** qué explorar primero, por qué, qué puede invalidarlo y qué preguntar. Al seleccionar una afirmación se abre su fuente y fragmento en un panel lateral.

Durante la búsqueda, mostrar progreso por descubrimientos reales: fuentes encontradas, datos extraídos, contradicciones detectadas. No mostrar como hallazgo algo que aún no se ha comprobado. UUIDs, intentos, versiones y logs quedan accesibles en un detalle técnico.

Para el video, interfaz y textos consistentes en inglés. Reutilizar el almacenamiento, los workers, la comparación y las decisiones existentes. Renovar la presentación del recorrido principal sin reescribir el producto entero ni introducir un mapa como requisito.

## Uso propuesto de los créditos

Las capturas muestran USD 70 en Exa y USD 105 de uso disponible en Apify. La segunda corresponde al período mostrado, hasta el 17 de septiembre; no acredita por sí sola cómo se renueva o vence el beneficio.

| Etapa | Tope de planificación Exa | Tope de planificación Apify | Finalidad |
| --- | --- | --- | --- |
| Probar fuentes y extracción | USD 5 | USD 10 | Confirmar que obtenemos evidencia útil y medir consumo |
| Integración, ensayos y demo | USD 5 adicionales | USD 5 adicionales | Repetir un conjunto acotado y cubrir fallos |
| Saldo sin asignar inicialmente | USD 60 | USD 90 | Ampliación posterior basada en resultados |

Estos son límites propuestos, no gasto realizado ni estimaciones garantizadas. Primero verificación pequeña; no habilitar recarga automática.

[Exa publica](https://exa.ai/docs/reference/pricing) USD 7 por 1.000 búsquedas estándar de hasta diez resultados y USD 1 por 1.000 páginas por tipo de contenido. Como referencia, 1.000 búsquedas más 3.000 páginas de texto suman aproximadamente USD 10 bajo esas condiciones; resúmenes, resultados extra y otros modos agregan cargos. Eso no equivale a 1.000 investigaciones completas.

[Apify cobra según el Actor y los recursos](https://docs.apify.com/actors/running/actors-in-store). Medir una muestra antes de extrapolar; fijar páginas, concurrencia, memoria, tiempo y límites soportados por el Actor. El límite monetario por eventos no debe asumirse como tope universal de todos los cargos de infraestructura.

El costo de un modelo externo de extracción/síntesis se registra aparte: estos créditos no acreditan saldo en otro proveedor. Para el corte de demo, preferir extracción acotada y explicaciones apoyadas en campos validados.

## Guion de 120 segundos

| Tiempo | Lo que ve la persona |
| --- | --- |
| 0–15 s | Problema: un equipo tiene presupuesto y necesita decidir qué oportunidades merecen inversión/investigación. Perfil concreto. |
| 15–35 s | Investigación real y tres alternativas con enlaces y datos legibles. Si hay una espera, el video puede editarla y señalar el tiempo real. |
| 35–70 s | Abrir un antecedente útil, su fuente y la relación con el producto. Mostrar también una contradicción o limitación que cambie la evaluación. |
| 70–95 s | Comparar; explicar por qué una opción merece investigación primero, cuál queda descartada o pendiente y qué condición falta para gastar. |
| 95–110 s | Guardar el brief con preguntas concretas y reabrirlo. |
| 110–120 s | Explicar una decisión técnica propia: extracción trazable, incertidumbre preservada y trabajo durable. |

El material precargado para fluidez debe provenir de una investigación real persistida y mostrar fecha. No simular una llamada en vivo ni preparar hallazgos falsos. Si solo una opción tiene soporte, explicar esa cobertura.

## Qué continúa después de postular

1. Completar la corrección de todos los hallazgos de la auditoría, incluidos navegación histórica, estados `confirmed`, fechas con zona y ciudad pendiente; no declarar resueltos los que se hayan recortado de la demo.
2. Ampliar investigación por perfil y empresas comparables; incorporar publicaciones dirigidas de X/LinkedIn si la prueba de fuentes aporta valor adicional.
3. Añadir refresh explícito y un resumen de cambios que explique qué evidencia nueva modifica una decisión previa. El monitoreo programado vendría después.
4. Incorporar costos aportados por el comprador y escenarios: variar presupuesto o modalidad debe cambiar restricciones de forma explicable. Conversiones y retorno, si se exploran, serán supuestos editables hasta disponer de outcomes propios.
5. Probar con al menos tres personas de growth/DevRel sobre una decisión real. Medir tiempo, errores detectados, información que no conocían y si usarían el brief para su siguiente conversación. Disposición a pagar se pregunta y observa; no se deduce del uso.

## Definición de una demo lograda

- El usuario puede explicar para qué sirve después de verla.
- Hay información real adicional a la página del evento que ayuda a elegir o descartar.
- Todas las afirmaciones que cambian la decisión tienen soporte inspeccionable y la entidad/edición correctas.
- La incertidumbre relevante se conserva; no hay precios inventados ni garantías de resultados.
- El enlace al evento está siempre visible y funciona.
- La salida es una acción y una explicación, además de un conjunto de fuentes.
- El recorrido persiste y se puede repetir sin depender de coincidencias preparadas en fixtures.
- El autor puede explicar el código, lo que aportan sus proveedores y los límites que todavía quedan.

La propuesta usa Exa y Apify como medios para conseguir evidencia. La contribución del proyecto será conectar esa evidencia con una decisión concreta, de forma comprensible y verificable.
