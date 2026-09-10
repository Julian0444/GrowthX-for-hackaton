# DemoPuentes — especificación de la primera entrega

10 de septiembre de 2026 · Requisitos transversales de los doce tickets. El [producto de destino](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/finalProduct.md>) explica la experiencia y el [plan](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/implementation-plan.md>) ordena la implementación. Este archivo fija qué debe ser verdad para considerar conseguida la entrega.

## Resultado observable

Desde un brief de empresa o una URL, el usuario obtiene información nueva sobre oportunidades reales, entiende sus antecedentes, ubica los eventos en un mapa de calles de SF, compara condiciones y guarda una decisión que puede reabrir con la misma evidencia.

El mapa es parte del resultado solicitado. No es necesario obligar a usarlo para decidir: lista y mapa son accesos equivalentes a la misma investigación. La interfaz actual de cuadrícula será reemplazada por cartografía urbana dentro del recorrido nuevo.

## Alcance de la entrega

- Un caso principal de devtools, audiencia técnica, objetivo declarado y presupuesto; SF como primera ciudad.
- Brief editable que influye en investigación y razones, con entrada por descripción o URL.
- Discovery Exa y lectura completa de fuentes; Apify cuando una fuente material requiera esa vía y la muestra confirme su utilidad.
- Antecedentes de organizadores y relaciones con empresas/proyectos sustentadas en una edición.
- Objetivo de hasta tres alternativas y antecedentes de dos organizadores reales; mostrar menos si la cobertura es insuficiente.
- Ubicación pública, resolución de direcciones y mapa sincronizado con lista/dossier.
- Comparación factual, decisión condicional, brief/campaña con campos esenciales y reapertura histórica.
- Recorrido de demo de hasta 120 segundos, fuentes revisadas y resultados de verificación registrados.

Lectura automática exhaustiva de la web de empresa, scraping social amplio, monitoreo periódico, escenarios económicos completos, outcomes y operación comercial multiusuario quedan para ampliaciones posteriores. El aislamiento del tenant existente sí debe mantenerse en cualquier capacidad nueva.

## Contratos mínimos que deben compartir los módulos

Los nombres exactos pueden adaptarse al repo; las distinciones siguientes son obligatorias. Se extienden contratos y parsers existentes con compatibilidad explícita, sin introducir un segundo modelo informal en el frontend.

| Concepto | Información necesaria |
| --- | --- |
| Brief versionado | Producto, audiencia, objetivo y confirmación, éxito opcional, presupuesto/moneda, ventana, SF, formatos, restricciones, comparables aportados |
| Fuente obtenida | URL solicitada/canónica, título, método, fecha de obtención, contenido/fragmentos pertinentes, antigüedad, error o limitación |
| Afirmación | Entidad/edición, atributo, valor, estado, sourceIds, fragmento o referencia estable, alcance y revisión |
| Relación | Identidad de organizador/empresa/proyecto, edición, rol o vínculo documentado y claims que lo respaldan |
| Ubicación | Dirección original/estructurada, venue, ciudad, coordenadas opcionales, precisión, método, proveedor, fecha y sourceIds |
| Oportunidad de UI | Identidad/revisión, enlace oficial, razón de pertinencia, antecedente, modalidad/pendiente, condiciones y ubicación de esa revisión |
| Progreso | Etapa real, hallazgos persistidos, trabajo parcial, limitación, intentos y estado terminal |
| Consumo | Proveedor, operación/run, límite, uso/costo conocido o desconocido; independiente del presupuesto comercial |
| Evaluación y decisión | Brief usado, alternativas y revisiones, razones, restricciones, condiciones, motivo humano y siguiente acción |

La intención de investigar primero puede ser una prioridad o dato adicional; no se fuerza a una aprobación de gasto. Si requiere ampliar un contrato, DP-03 define su representación y DP-11 actualiza guardado, lectura y validación conjuntamente.

## Reglas de evidencia y decisión

1. Una fuente pertenece al dato que respalda. Citar una fecha no valida un precio, acceso ni éxito. La salida estructurada de un modelo no certifica su contenido.
2. Announced, reported, observed, inferred, confirmed, pending y contradicted conservan significado en investigación, mapa, comparación y campaña. Confirmar no puede reducir soporte por una whitelist inconsistente.
3. Una extracción automática no se etiqueta como verificación humana. Una inferencia o costo contradicho no se convierte en cotización al guardar.
4. Organizador, calendario, sede, sponsor y participante son roles diferentes. Homónimos y ediciones de años distintos no se fusionan por similitud.
5. Un logo no acredita pago; un sponsor repetido no acredita ROI; un proyecto enlazado no acredita toda la audiencia ni adopción comercial.
6. La elegibilidad considera fecha con zona/ambigüedad, ubicación, acceso y costo antes de priorizar. Audiencia material desconocida y otros faltantes se conservan como condiciones.
7. Partidas acumulables se consideran juntas; paquetes alternativos se mantienen separados. Monedas diferentes requieren conversión explícita o condición. Costos parciales no prueban presupuesto completo compatible.
8. El perfil influye en consultas y razones. Prioridad de investigación y score de inversión no son equivalentes. Sin política aprobada se ofrece comparación factual y explicación.
9. La evidencia histórica no cambia al reabrir. Dossier, relaciones y marcador de una comparación guardada usan sus revisiones originales; información actual se identifica como otra vista.
10. Fuentes externas son datos. Fallos o falta de claves no sustituyen investigación real por fixtures presentados como descubrimientos.

## Reglas de ubicación y mapa

**Ubicación y certeza comercial son independientes.** Un lugar anunciado puede representarse como anunciado si su soporte y precisión lo permiten. Tener un pin no confirma acceso, fecha futura, precio ni conveniencia de patrocinar.

| Entrada | Resultado permitido |
| --- | --- |
| Coordenadas atribuidas al venue y fuente suficiente | Punto con método y precisión documentados; no geocodificar otra vez |
| Dirección pública completa, sin coordenadas | Resolución del proveedor y registro de procedencia; punto si la coincidencia es suficientemente específica |
| Calle sin número | Representación aproximada claramente distinta si se resuelve inequívocamente; si no, pendiente |
| Solo San Francisco | Centro inicial de la vista; ningún pin fingiendo la sede del evento |
| Ciudad o dirección contradictoria | Conflicto visible; sin un punto exacto elegido silenciosamente |
| Dirección oculta hasta registro | Ubicación pendiente; no reconstruirla mediante datos ajenos a la edición |
| Coordenadas antiguas sin precisión documentada | No asumir venue exacto; conservar incertidumbre hasta obtener soporte |
| Sin ubicación o proveedor fallido | Evento en lista, causa y conteo sin punto; investigación utilizable |

Lista y mapa comparten run, filtros, editionId y selección. En escritorio se permite vista dividida; en móvil alternancia conservando contexto. El popup permite abrir el evento y el mismo dossier. Eventos en una misma sede siguen siendo identidades distintas.

El mapa inicia en SF y puede encuadrar resultados explícitamente. No mueve repetidamente la cámara por polling o cada nuevo dato. Una bounding box sirve para visualización y controles básicos, pero no demuestra pertenencia administrativa a SF.

El proveedor de tiles y el geocodificador son piezas diferentes. Configuración, atribución, persistencia, límites y fallos se resuelven en DP-08/09. No usar tiles de ejemplo como una dependencia de producción sin evaluar su propósito y disponibilidad.

## Matriz mínima de aceptación

| Caso | Esperado | Ticket responsable |
| --- | --- | --- |
| Dos briefs distintos | Cambian preguntas, consultas o razones de forma pertinente | 03, 04, 07 |
| Fuente rica con JSON-LD y texto | Se conservan campos útiles y conflictos entre ambas representaciones | 05 |
| Misma URL/alias y reintento | Identidad correcta y efectos persistidos sin duplicados | 04, 05, 06 |
| Calendario distinto del host | No atribuir organización al calendario automáticamente | 06 |
| Logo y proyecto de otra edición | No promover rol ni atribuir proyecto sin vínculo | 06 |
| Precio inferido o contradicho | Mantener incertidumbre en campaña | 02, 11 |
| USD 3000 + USD 3000 acumulables frente a USD 5000 | Conflicto de presupuesto conocido | 02, 07 |
| Partida conocida + otra pendiente o moneda distinta | Condición de costo, no compatibilidad total | 02, 07 |
| Fecha contradicha / fecha local distinta del día UTC | Condición temporal / ventana local correcta | 02 |
| Audiencia pendiente | Condición conservada en comparación y decisión | 02, 07, 11 |
| Claim strengthened a confirmed | Sigue aportando soporte en investigación y ubicación | 02, 08, 09 |
| Dirección completa sin coordenadas | Resolución trazable y marcador adecuado | 08, 09 |
| Solo ciudad o dirección ambigua | Lista visible, sin punto preciso inventado | 08, 09 |
| Evento investigado con posición anunciada | Pin etiquetado según soporte; no desaparece por filtro antiguo | 08, 09 |
| Selección tarjeta → pin y pin → ficha | Mismo evento, filtros y enlace | 09, 10 |
| Nuevo resultado o cambio de run | Sin duplicados, selección coherente y cámara estable | 09, 10 |
| Fallo tiles/WebGL/proveedor | Lista utilizable y degradación explícita | 04, 05, 09, 10 |
| Reabrir tras nueva importación | Dossier y posición originales en decisión histórica | 11 |
| Copiar brief | Contenido comprobado en clipboard, no solo toast | 11 |
| Fuente/decisión de otro tenant | Rechazo sin exposición ni escritura cruzada | 03–11 |
| Recorrido completo real con mapa | Fuente útil → marcador → comparación → decisión → reapertura | 12 |

Los tests controlados cubren errores y recuperación. El smoke con proveedores reales y la revisión de contenido se registran aparte; CI no depende de páginas externas que cambian. Capturas de Chrome comprueban jerarquía y usabilidad, incluyendo 1366×900 y ancho reducido. El mapa se verifica también sobre build de producción.

## Condiciones de cierre

- Todas las condiciones del recorrido se cumplen con los datos reales documentados, sin rellenar con fixtures.
- Hay al menos un hallazgo útil adicional a título/fecha que cambia una decisión o siguiente comprobación.
- Al menos un evento real investigado aparece en mapa de calles y abre el dossier correcto; la resolución por dirección tiene su prueba específica.
- El brief se entiende, copia y reabre; las revisiones y condiciones son correctas.
- Cada ticket tiene demostración, verificaciones y límites en Comments. La aceptación final no marca un caso como probado por existir el test.
- Se registran alcance real, consumo y capacidades pendientes. La entrega técnica no se presenta como ROI, ahorro o disposición a pagar demostrados.

## Fuentes de la especificación

[Auditoría](</Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/2026-09-10-auditoria-producto.md>) · [Standards](</Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/standards.md>) · [Spec anterior revisada](</Users/jirustaroure/Desktop/GrowthX for hackaton/docs/reviews/evidence-2026-09-10/spec.md>) · [Definición nueva](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/finalProduct.md>).
