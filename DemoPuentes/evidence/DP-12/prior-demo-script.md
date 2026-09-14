# Guion de demo para Puentes — 2 minutos

Borrador del 10 de septiembre de 2026 (v2: el problema se explica antes de mostrar los casos), preparado antes del cierre de DP-12 mientras se completan DP-06/07/09/10/11. El video final debe grabarse sobre la app real: cada línea marcada **[ADAPT]** se ajusta a lo que la app efectivamente muestre ese día; no se afirma en voz nada que la pantalla no respalde. Formato exigido por el formulario: video en **inglés**, **máx. 2 minutos**, en **YouTube o Loom**, mostrando un proyecto de software propio.

Recomendación de formato: **Loom con burbuja de cámara** (piden "interview": que se te vea). El bloque del problema va a cámara con cortes rápidos a las páginas reales; desde el brief en adelante manda la pantalla.

## Historia en una frase

> Growth teams at dev-tools startups get asked "should we sponsor this hackathon?" with the evidence scattered across pages they can't compare; Growth Atlas researches the web for real, connects organizers' track records to the buyer's goal, keeps every claim tied to its source, and produces a decision brief you can reopen with the same evidence.

## Estructura: problema → qué es → caso → demo → cómo está hecho

| Tiempo | Bloque | Pantalla | Qué queda claro |
| --- | --- | --- | --- |
| 0:00–0:26 | El problema | Cámara + cortes a las páginas reales (Luma, sitio del organizador, galería de proyectos, página de sponsors) | Decidir un patrocinio hoy es juntar piezas dispersas y terminar eligiendo por marca o por un deck |
| 0:26–0:34 | Qué es + caso | Brief con producto, USD 5.000, 6 semanas, SF | Growth Atlas investiga esa pregunta; hay una decisión concreta |
| 0:34–0:52 | Investigación + mapa | Run con fecha → 3 oportunidades → mapa SF con pin en 501 Folsom St; Agent Arena sin pin | Investiga de verdad y no inventa lo que no sabe |
| 0:52–1:16 | El hallazgo | Expediente de AI Tinkerers: edición dic-2025, proyectos, fragmento de evidencia; condición de Hackathons.team | El hallazgo cambia la evaluación; la incertidumbre se conserva |
| 1:16–1:32 | Comparación | Panel: elegibilidad → prioridad de investigación → condiciones | La salida incluye razonamiento y condiciones |
| 1:32–1:44 | Guardar y reabrir | Decisión guardada, brief copiado, cerrar, reabrir | El trabajo conserva evidencia y continuidad |
| 1:44–1:55 | Decisión técnica | Cámara o panel de evidencia | El LLM no tiene autoridad sobre los hechos |

Base: ≈290 palabras (~150 wpm, ritmo de demo). Si al ensayar pasás de 1:55, aplicá los recortes ▼ de abajo (bajan a ≈255).

## Guion detallado

### Bloque 0 · 0:00–0:26 — El problema (66 palabras)

**En pantalla:** Cámara grande. Mientras enumerás las fuentes, cortes de 2–3 s a páginas reales del caso: la ficha de Luma del AI Security Hackathon, la portada de hackathons.team, la galería de proyectos de AI Tinkerers, la página de sponsors que dice "We do not publish packages". Son las mismas fuentes que después investiga la app.

**Voz (EN):**
> Hi, I'm Julian. If you do growth at a dev-tools startup, someone will ask: should we sponsor this hackathon? The evidence is scattered — event pages, organizer sites, project galleries, sponsor decks you can't compare — so teams decide on brand names or a nice deck. The real question comes before spending: does this fit our product, and what has to be true for the money to make sense?

### Bloque 1 · 0:26–0:34 — Qué es y el caso (21 palabras)

**En pantalla:** Brief/perfil ya cargado: agent observability platform, audiencia técnica, objetivo, USD 5.000, ventana de 6 semanas, San Francisco.

**Voz (EN):**
> Growth Atlas researches exactly that. Illustrative case: you sell observability for AI agents — five thousand dollars, six weeks, San Francisco.

*"Illustrative case" deja claro que el comprador es ficticio sin frenar el ritmo.*

### Bloque 2 · 0:34–0:52 — Investigación real + mapa (46 palabras)

**En pantalla:** Abrir la investigación guardada (con su fecha de hoy visible). Etapas del run y las 3 oportunidades: Agents, Everywhere (AI Tinkerers, Sep 12) · AI Security Hackathon (Sep 13) · The Agent Arena (Vultr, Sep 26–27). Vista de mapa: pin en 501 Folsom St; Agent Arena queda en la lista sin pin. Click en el pin → mismo dossier.

**Voz (EN):**
> From that brief it runs real web research — Exa queries, full page reads, every source saved. This run from earlier today found three upcoming SF hackathons. This one publishes a street address, so it's on the map; ▼this one only says "San Francisco" — no fake pin.

**[ADAPT]** "earlier today" debe coincidir con la fecha real del run. Si DP-09 (mapa de calles) no llegó: quedarse en "Public location" con la procedencia del geocoder (verificado en DP-08) y decir *"…so it's resolved to coordinates, with provider, query and precision on record."* No mostrar ni nombrar un mapa que no exista.

### Bloque 3 · 0:52–1:16 — El hallazgo (60 palabras) — EL CENTRO DEL VIDEO

**En pantalla:** Desde el evento de AI Tinkerers, abrir el expediente del organizador: edición anterior real (Secure Agents Buildathon, SF, dic-2025, "Documented role: organizer"), proyectos publicados, y desplegar **Evidence** para mostrar el fragmento con URL/fecha/estado. Luego la condición del segundo organizador (Hackathons.team: primera edición, sin resultados propios).

**Voz (EN):**
> Here's what changes the decision. AI Tinkerers ran a buildathon in SF last December — the app links that past edition, its published projects, and the source fragment behind every claim. So instead of buying a logo, we can pitch a hands-on integration. The second organizer is on its first-ever edition, so the app keeps a condition: ask for references before spending.

**Opcional ▲ (+19 palabras, +8 s) si vas sobrado:** *"And contradictions stay visible — this site announces the event on one page and 'no events scheduled' on another."* (mostrar el conflicto conservado de hackathons.team).

**[ADAPT]** Depende de DP-06 (relaciones organizador–edición–proyecto en el dossier). Si al grabar el expediente aún no muestra proyectos vinculados, mostrar el antecedente que sí exista (rol documentado + edición anterior) y quitar "its published projects".

### Bloque 4 · 1:16–1:32 — Comparación (40 palabras)

**En pantalla:** Panel de comparación con las opciones bajo el mismo brief: elegibilidad primero, razón por opción, prioridad de investigación explicada, condiciones pendientes (costo total desconocido, audiencia pendiente, acceso por aprobación).

**Voz (EN):**
> The comparison separates three questions: can we participate, why it's relevant, how well we know it. Blockers come first — dates, budget; then what to research first and why. ▼Unknown costs and pending audience stay as conditions, not a score.

**[ADAPT]** No nombrar una "ganadora" salvo que sea exactamente lo que el panel muestre; la prioridad la dicta la salida real de DP-07. Si DP-07 no llegó: usar la comparación factual persistida existente y decir *"it lays out the factual differences and what's still missing"* en lugar de la frase de prioridad.

### Bloque 5 · 1:32–1:44 — Guardar y reabrir (29 palabras)

**En pantalla:** Guardar la decisión con motivo + condición, copiar el brief (mostrar el texto copiado, no solo el toast), cerrar, reabrir desde Decisiones: misma evidencia, misma revisión.

**Voz (EN):**
> I save the decision brief — reasons, conditions, next questions — copy it, close everything, reopen: same evidence, same revisions. ▼Research you can defend to whoever approves the budget.

**[ADAPT]** Depende de DP-11 para campos de campaña/copy; si no llegó, la reapertura de evaluaciones persistidas ya existe — mostrar esa y omitir "copy it".

### Bloque 6 · 1:44–1:55 — Decisión técnica (26 palabras)

**En pantalla:** Volver a cámara, o quedarse en el panel de evidencia.

**Voz (EN):**
> My favorite design decision: the LLM only writes narrative. Facts, eligibility and ranking come from deterministic code over persisted, versioned sources — nothing invents authority. Thanks!

## Recortes ▼ si te pasás de tiempo (en este orden)

1. Bloque 2: "this one only says 'San Francisco' — no fake pin".
2. Bloque 4: "Unknown costs and pending audience stay as conditions, not a score".
3. Bloque 5: "Research you can defend to whoever approves the budget".
4. Bloque 0: "so teams decide on brand names or a nice deck" (duele, pero el problema ya quedó planteado con "you can't compare").

No recortar el bloque 3: es el momento que justifica el producto.

## Reglas de honestidad (de spec.md / DP-12 — no negociables)

- El material precargado se identifica con fecha; **no simular búsqueda en vivo** ni atribuir latencias inexistentes.
- El comprador es ilustrativo; no presentarlo como cliente ni la demo como validación comercial. No prometer ROI, ahorro medido ni disposición a pagar.
- No afirmar en voz nada sin soporte en pantalla: un pin no es recomendación, un logo no prueba pago, geocodificar no confirma celebración.
- No mostrar `.env`, claves, dashboards de saldo de Exa/Apify ni datos de otro tenant.

## Checklist antes de grabar

- [ ] Ejecutar y persistir la investigación real el mismo día (fecha visible). Revisar vigencia de fuentes: desde el 12/09 O1 deja de ser futura — **grabar antes**, o adaptar a las opciones que sigan vigentes sin cambiar fechas.
- [ ] Tener abiertas en pestañas las 4 páginas reales del bloque 0 para los cortes.
- [ ] Verificar etiquetas de UI en inglés en las pantallas del recorrido (criterio DP-10). Si falta alguna, pedir a la sesión worker que priorice esas pantallas.
- [ ] Ensayar cronometrado 2–3 veces; objetivo ≤1:55.
- [ ] Ventana ~1366×900, navegador limpio, sin notificaciones, sin pestañas ajenas.
- [ ] Ruta de clicks anotada (este archivo en otro monitor).

## Checklist de cierre (reservar ≥45 min antes de las 20:00 PT)

- [ ] Subir a Loom o YouTube (unlisted), verificar reproducción en ventana incógnito.
- [ ] Pegar el enlace en el formulario y completar el resto de campos.
- [ ] Confirmar envío antes del cierre; el guion no publica nada por sí mismo.
