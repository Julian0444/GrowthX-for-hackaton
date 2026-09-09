# Discovery: entrevista con growth de Terac (validación de sponsors)

Fuente: notas AI de Fellow de la charla grabada por Miranda y Julian con el responsable de growth de Terac ("Tarik" en la transcripción). Fecha de registro: 2026-09-04. Estatus de toda afirmación: **reportada en entrevista** (un caso, una voz) — evidencia de dolor y comportamiento del comprador, no hechos verificados del mercado.

## Mapa dolor → feature → dónde vive en la arquitectura (ADR 0001)

| Dolor reportado (timestamp) | Qué valida | Dónde vive |
|---|---|---|
| Checklist manual antes de patrocinar: track record del organizador, asistencia histórica, composición de audiencia, outcomes proyectados (06:55) | **El dossier de evento/organizador es el comportamiento actual del comprador, hoy manual.** Automatizamos algo que ya hace | Catálogo y evidencia: claims por evento y organizador |
| Prometieron ~150 asistentes, fueron ~60; "no habría patrocinado de saberlo" (12:41). Proyectaron 50% founders, fue ~25% (14:13) | **El ledger estimado-vs-real es dolor de compra bloqueante** y también dolor del organizador que sobre-promete | Episodios (memoria episódica) + índice de organizadores |
| No existe marketplace centralizado de sponsorships cash/créditos; hacen scraping manual de emails con Claude Code (07:16) | **El radar de patrocinios ataca un vacío real** — de hecho ellos mismos lo improvisan | Radar sobre el Catálogo (señal "busca sponsors") |
| Cold outreach ignorado; formularios revisados 1 vez al mes; todo lo bueno vino por warm intro: Stripe, Lovable, WAP (08:01) | **Corrección clave: el output del radar no puede ser "acá está el email"** — tiene que ser el camino cálido al contacto | Cambia el entregable del radar (ver abajo) |
| Pidieron un "social graph": a cuántas conexiones estás del head de DevRel objetivo (08:33) | Feature de alto valor sugerida por el propio comprador | Experimento futuro; proxy v1 con trazas públicas |
| ROI de hackathons = recruiting: $5K de sponsorship vs fee de agencia por contratar un ingeniero (04:49); conferencias = enterprise deals (06:19) | **Confirma métricas por objetivo, no promediadas** (coincide con la política de scoring del research §8.3) y da ancla de pricing | Políticas de scoring por objetivo; pitch |
| Evitar eventos de estudiantes primerizos; buscar seniority y poder de compra (05:21) | Claim de dossier: mix de seniority de la audiencia | Catálogo: composición de audiencia |
| 30 sponsors con acuerdos custom trackeados de memoria/texts; algunos verbales (16:27). Confirmó que herramientas de transparencia de acuerdos serían útiles (15:18) | **Apertura de producto lado organizador**: registro de compromisos + estimado-vs-real compartido | Extensión del contrato de medición al organizador |
| Créditos ≠ cash: sponsors de solo-créditos son netos negativos para el organizador; se marketean como equivalentes a dólares (19:18, 19:49) | El costo/valor de un sponsorship no es un número: cash / créditos / premio cubierto se declaran por separado | Catálogo: `cost_items` tipados (coincide con research §11) |
| Lista de asistentes llegó tarde en una conferencia de NY; se perdió la cena donde pasan los deals (13:04) | La inteligencia de *timing* importa: SLA de lista de asistentes como parte del acuerdo | Contrato de medición |
| Relación con organizador vale más que el ROI de un evento: breakeven aceptable si fortalece la relación (09:52) | El grafo de relaciones sponsor-organizador es un activo en sí | Episodios + futuro grafo |
| "No hay suficientes empresas construyendo tooling de eventos"; ofrece probar el MVP (19:01); invitación al hackathon de este finde (22:47) | Design partner dispuesto + validación de vacío de mercado | Piloto |

## Lo que esta entrevista corrige de nuestras ideas

1. **El radar de sponsors sin camino cálido es débil**: el cold email está muerto para este comprador. El entregable correcto es "estás a 1 intro de este organizador: X patrocinó su edición pasada y es cliente tuyo / Y fue juez y trabaja con vos". Proxy v1 sin datos privados: co-ocurrencias públicas (sponsors históricos, jueces, speakers, co-organizadores).
2. **El caso Terac aporta dos observaciones reportadas cuya independencia no está establecida.** Por las notas parecen eventos y roles distintos (150→60 en un evento que Terac patrocinó, 12:41; 50%→25% founders en el evento que Terac organizó, 14:13), pero hasta confirmarlo con datos primarios no se cuentan como episodios separados ni como soporte independiente. Ambas se guardan como `reported` (política del research §10.3) y se piden fecha, evento y método de medición antes de generalizar.
3. **El lado organizador no es "otro producto lejano"**: el mismo ledger estimado-vs-real que protege al sponsor le sirve al organizador serio para demostrar legitimidad (el efecto "Stripe/Lovable firmaron primero"). Dos lados alimentando el mismo dataset = el moat compone más rápido.

## Acción pendiente registrada en la charla

- Miranda envía el link de Luma del hackathon del finde (23:17) — candidato a primer evento del catálogo verificado v1.
