# Casos de uso de GrowthX

Registro original: 2026-09-04 · Foco y prioridad revisados: 2026-09-07. Fuentes: docs fundacionales (Word, deck FC Build, HackatonIdea), entrevista de discovery con Terac ([discovery-terac-2026-09.md](../research/discovery-terac-2026-09.md)) e ideación de esta semana. Etiquetas: **[entrevista]** = dolor reportado en la entrevista (falta probar uso y disposición a pagar) · **[tesis]** = viene de los docs fundacionales · **[nueva]** = idea de esta semana, sin validar.

Growth Atlas en una frase: *investiga organizadores y eventos de San Francisco para que un equipo de growth decida en qué invertir, con antecedentes, fuentes y condiciones pendientes.* El primer comprador es el equipo que evalúa el patrocinio. El organizador como usuario y el seguimiento posterior permanecen en la visión, fuera del primer slice.

## A. Equipo de Growth / GTM / DevRel (quien patrocina)

### Antes — decidir dónde aparecer

1. **Descubrir organizadores y eventos pertinentes en SF** [tesis + dirección 2026-09-07] — desde producto, audiencia y presupuesto, encontrar organizadores con antecedentes pertinentes dentro del catálogo curado; abrir sus ediciones futuras. Mostrar por qué aparecen y los límites de cobertura.
2. **Dossier del evento** [entrevista] — lo que el comprador hoy chequea a mano (06:55): audiencia esperada y real de ediciones pasadas, qué construyó la gente (Devpost), sponsors históricos y si repiten, precios, cash vs créditos.
3. **Expediente del organizador** [entrevista] — ediciones y rol de organización documentado, audiencia, empresas participantes con su rol y resultados reportados cuando existen. El usuario puede aportar competidores o comparables; un logo o repetición no demuestra ROI. Las observaciones de Terac 150→60 y 50%→25% conservan atribución e independencia no establecida, sin puntaje universal de reputación.
4. **Radar de patrocinios** [entrevista] — alerta cuando un evento con fit abre búsqueda de sponsors en tu ventana y presupuesto (hoy no existe marketplace, 07:16).
5. **Camino cálido al contacto** [entrevista] — a cuántas intros estás del organizador/DevRel objetivo; el cold outreach está muerto (08:01) y el social graph lo pidió el propio entrevistado (08:33). Trazas públicas (co-sponsors, jueces, speakers compartidos) muestran *vínculos potenciales*; "estás a una intro" solo se afirma con una conexión confirmada.
6. **Momentum social del evento** [nueva] — detectar cuando personas relevantes o con muchos seguidores postean sobre el evento. Hipótesis a comprobar: que el buzz anticipe calidad y asistencia. Followers ≠ asistentes, identidad verificada, entra como evidencia con confianza y no influye decisiones hasta validarse.
7. **Comparar y decidir con evidencia** [tesis] — hasta 3 planes de inversión con pruebas y costos completos, o abstención honesta.

### Durante — ejecutar bien

8. **Plan de campaña listo** [tesis] — track sugerido, premio, workshop previo, mensaje al organizador (flujo original, HackatonIdea §6).
9. **Instrumentación y timing** [entrevista] — códigos/cohortes para atribuir, y SLA de lista de asistentes a tiempo (la cena perdida en NY, 13:04).

### Después — medir y aprender

10. **ROI real por objetivo** [entrevista] — costo por developer activado y retenido (adopción); costo por hire (recruiting: $5K de sponsorship vs fee de agencia, 04:49); deals (conferencias, 06:19). Nunca un score promediado entre objetivos.
11. **Memoria que aprende** [tesis] — cada evento medido aporta evidencia para evaluar y mejorar las próximas decisiones (la mejora se comprueba en casos posteriores, no se asume); "¿repetimos el año que viene?" se contesta con datos propios. Incluye registrar *por qué* se eligió o descartó cada alternativa — un descarte no es una campaña fallida: su resultado nunca se observó.

## B. Organizador de eventos (el segundo lado)

12. **Ledger de acuerdos con sponsors** [entrevista] — qué se prometió a cada uno; hoy: 30 deals custom en memoria, texts y acuerdos verbales (16:27); confirmó utilidad (15:18).
13. **Perfil verificado del organizador** [derivada de entrevista] — demostrar cumplimiento con datos: afirmaciones verificadas con su alcance (qué evento, qué se prometió, qué se entregó), no un puntaje único; efecto legitimidad Stripe/Lovable (21:37).
14. **Matchmaking inverso** [entrevista] — encontrar sponsors cuyo ICP coincide con tu audiencia, en vez de formularios que se revisan una vez al mes.
15. **Vender con buzz** [nueva] — mostrar el momentum social del evento a sponsors potenciales.

## C. El círculo que lo une todo

Decidir → ejecutar → medir → aprender → decidir mejor. Cada campaña medida (lado sponsor) y cada acuerdo registrado (lado organizador) alimentan el mismo historial. Ese historial es el moat declarado en el pitch: nadie lo copia llamando a una API.

## Prioridad de construcción vigente (ADR 0001, v1.2, 2026-09-07)

Esta tabla sustituye la prioridad del 4 de septiembre para el primer slice. La visión anterior de campaña→medición→memoria sigue como horizonte; no obliga a construirla para probar la utilidad de la investigación previa.

| Prioridad | Casos | Corte actual |
| --- | --- | --- |
| P0 — investigación y decisión | 2, 3, 7 | Dossier de evento, expediente de organizador y comparación con elección/descartes/pendientes guardados. Incluye antecedentes de empresas comparables con roles y fuentes; resultados desconocidos se declaran. |
| Entrada necesaria al P0 | 1 | Descubrimiento sobre catálogo manual de SF, desde perfil de empresa, con razones por atributo. Dashboard principal y mapa local secundario. |
| Borrador mínimo | 8, parte de 12 | Modalidad, costos, preguntas y estimación/objetivo/compromiso dentro de una decisión. Sin portal de organizador ni ejecución. |
| Después del slice | 9, 10, 11 | Instrumentación, outcomes y aprendizaje. Solo la conservación de motivos y evidencia de decisiones pertenece al slice actual. |
| Fuera del slice | 4, 5, 13, 14 | Radar automático de sponsors, camino cálido, producto del organizador y matchmaking inverso. Investigar antecedentes desde el comprador no implica construir ese segundo lado. |
| Experimentos posteriores | 6, 15 | Buzz y popularidad no influyen en una inversión. |

## Qué cambió en la experiencia

La navegación es **dashboard con barra izquierda → organizadores → expediente → evento → comparación → decisión**. Se conserva la entrada directa por URL de Luma. El mapa se abre como vista opcional de eventos de SF. Los antecedentes pueden ser de otras ciudades si la fuente lo dice, pero no se presentan como oportunidades de SF.

Los 15 casos permanecen como inventario de ideas, no como compromiso de alcance. «Éxito» exige precisar quién lo reporta, qué objetivo se midió y con qué método. No encontramos el retorno de otra startup porque hayamos encontrado su logo.

[Producto de destino](../../plan/finalProduct.md) · [Plan del slice](../../plan/implementation-plan.md) · [Fuentes y límites](../research/fuentes-organizadores-sf-2026-09.md).
