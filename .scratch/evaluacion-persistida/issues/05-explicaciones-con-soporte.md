# 05 — Rechazar explicaciones cuyas citas no respaldan el texto

Status: ready-for-human

**Estado:** implementado (autorización explícita de Julian en sesión, 2026-09-08); pendiente de revisión humana.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [01](./01-congelar-v0-y-oraculos.md).

## Objetivo

Impedir que una respuesta de Gemini conserve afirmaciones sin soporte mediante citas inventadas, ajenas o sustituidas.

## Aristas de bloqueo

01 → 05: necesita la referencia y las costuras reproducibles de v0.

## Criterios de aceptación

- [x] Un ID inexistente, una cita de otra oportunidad o la ausencia de citas impiden publicar esa explicación como razón factual.
- [x] Un ID existente pero irrelevante tampoco basta: por ejemplo, evidencia de fecha no respalda «80% de asistentes senior». El contrato de salida limita los hechos publicables a atributos admitidos y a referencias que los respaldan.
- [x] Se elimina el fallback que mantiene la narrativa nueva mientras le asigna citas antiguas. Si la explicación no pasa, se recupera completa la explicación determinística respaldada, con advertencia visible.
- [x] Para no prometer un verificador semántico infalible, la salida factual publicable se compone desde hechos admitidos y plantillas. El modelo puede seleccionar hechos; texto libre que agregue afirmaciones queda fuera de la razón publicada.
- [x] La misma restricción alcanza titulares y borradores de campaña que atribuyan hechos al evento. Las propuestas de acción se distinguen de hechos y no inventan costos, audiencia o compromisos.
- [x] JSON inválido, timeout y una descripción con instrucciones de ignorar evidencias terminan en degradación explícita. No cambian el ranking ni la elegibilidad.

## Demostración

Inyectar una respuesta con una cifra inventada y otra con evidencia perteneciente a un candidato diferente. El panel conserva la explicación respaldada y muestra el estado de redacción, sin «arreglar» las citas de la afirmación falsa.

## Módulos y archivos probablemente afectados

`frontend/lib/server/reasoning/gemini.ts`, `frontend/lib/contracts/growxth.ts`, `frontend/lib/server/audit/labels.ts`, `frontend/components/atlas/opportunity-drawer.tsx`.
Nuevo previsto: `frontend/tests/acceptance/reasoning-support.test.ts`. El registro completo de claims se introduce en 07 y se conecta en 12; aquí se usa el subconjunto de hechos verificables de v0.

## Qué test lo demuestra

`reasoning-support.test.ts` atraviesa respuesta simulada del proveedor → validación → respuesta visible. Incluye cita inexistente, cita ajena, cita real irrelevante, afirmación contradictoria, salida válida y fallo de modelo. Verificar solo que `evidenceIds.length > 0` no satisface el ticket.

## Decisiones abiertas

Ninguna elección de modelo es necesaria. Se conserva Gemini detrás de la frontera actual hasta incorporar el adaptador del slice.

## Comments

### Qué se hizo

**Contrato — `frontend/lib/contracts/growxth.ts`** (solo tipos): nuevo `NarrativeState` (`status: 'deterministic_only' | 'validated' | 'rejected'`, `note` visible, `selectedEvidenceIds`) y campo opcional `Opportunity.narrative`. Es el «contrato de salida» del ticket: documenta que la redacción nunca crea hechos publicables — la razón factual visible se compone desde hechos admitidos (las razones determinísticas con su evidencia) y plantillas; el modelo solo selecciona hechos citando evidencia ya admitida por la misma oportunidad y propone copy de acción sin cifras propias.

**`lib/server/reasoning/gemini.ts`** (corrección del oráculo O4):

- `applyDecision` (el fallback que mantenía la narrativa nueva asignándole las citas propias de la oportunidad) se eliminó. En su lugar, `reviewDecision` valida la SELECCIÓN de evidencia de cada decisión: cita inexistente, cita ajena (fuera de los hechos admitidos de esa oportunidad) o ausencia de citas rechazan la decisión ENTERA — sin filtrar ni sustituir citas («arreglarlas» era exactamente el defecto).
- Rechazada → se recupera completa la explicación determinística respaldada (razones, titular y campaña intactos), con `narrative.status: 'rejected'` + motivo visible y un warning por candidato en el response.
- Validada → tampoco se publica el texto libre del modelo como razón: las razones visibles siguen siendo las determinísticas (hechos admitidos + plantillas). El aporte del modelo queda en `narrative.selectedEvidenceIds` (selección de hechos) y en las propuestas de acción (titular / variantes de campaña), pasadas por una guardia léxica conservadora: cualquier cifra (dígito, %, moneda) en texto libre es un costo/audiencia/compromiso cuantificado que ningún hecho admitido respalda → la propuesta se retiene (queda la determinística) y se anota en `narrative.note`. Deliberadamente estricta: no promete verificación semántica — por diseño no hace falta, porque el texto libre nunca entra al canal factual.
- Si NINGUNA decisión valida (p. ej. el modelo obedeció una descripción con instrucciones de ignorar evidencias), degradación explícita: warning global, estados `rejected` visibles, y NO se aplica el sort por `rank` — el ranking y la elegibilidad no cambian. Con al menos una validada, el sort por `rank` de v0 se conserva a propósito: es el defecto O5 y lo corrige el ticket 06 (el baseline lo reporta «defecto v0 vigente», sin INESPERADO).
- Sin clave, proveedor caído, JSON inválido o timeout → warning de siempre + `narrative.status: 'deterministic_only'` en cada oportunidad. Nunca lanza; nunca toca scores.
- El prompt ahora avisa las reglas al modelo (solo ids del mismo candidato; sin cifras en el copy). No cambia la autoridad: la validación es del servidor.

**`lib/server/audit/labels.ts`** (defensa en profundidad, segunda capa): una razón solo se publica si cita al menos una evidencia y cada cita resuelve en el response; sin soporte resoluble la razón se retira con warning y jamás se le asignan citas sustitutas. En los flujos actuales es un no-op (gemini.ts ya no deja pasar nada así; fixture y pipeline local son coherentes) — ataja regresiones y otros orígenes.

**`components/atlas/opportunity-drawer.tsx`**: el panel muestra el estado de redacción junto a «Why here» (validada / rechazada con motivo / solo determinística), con la nota visible. Reusa el estilo `.feed-down` existente (clase semántica `narrative-state` + `data-status`) para no tocar `globals.css`, fuera del alcance.

**Consumidores mínimos del contrato** (lista de archivos orientativa, según aclaración previa de Julian): `lib/api/types.ts` agrega `narrative?: NarrativeState` al Opportunity legacy y `lib/api/opportunity-adapter.ts` lo proyecta sin transformar, para que el estado llegue al drawer.

**Test nuevo — `frontend/tests/acceptance/reasoning-support.test.ts`** (9 casos, respuesta simulada del proveedor → validación → respuesta visible): cita inexistente (Berlín, grabación adversarial de 01; verifica el valor deseado del predicado O4.1 con `narrativeSubstitutionObservable`, la recuperación completa y que `evidenceIds.length > 0` NO basta — la decisión traía una cita y se rechazó); cita ajena (San Francisco citando Trends de India); cita real irrelevante (Bengaluru: la cifra «40+ meetups» no se publica, la selección válida sí se registra, las propuestas sin cifras se publican, y el estado llega a la proyección de UI vía adaptador); afirmación contradictoria inyectada (cita propia válida + texto que contradice el hecho admitido: no se publica); propuestas con cifras inventadas retenidas + decisión sin citas rechazada entera; fallo de modelo HTTP 503; JSON inválido y timeout; descripción con instrucciones de ignorar evidencias (todas rechazadas: ranking y scores idénticos al determinístico, degradación explícita); auditoría de labels (razón irresoluble/sin citas no se publica, respuesta coherente pasa intacta).

### Rojo/verde verificado

El test se escribió primero (junto con el contrato, solo tipos) y se corrió contra la v0 sin corregir: **9/9 en rojo**. Con la corrección: **9/9 en verde**. `baseline-v0.test.ts` sigue en modo diagnóstico (drift esperado, ahora suma `gemini.ts`, `labels.ts` y los ya driftados `growxth.ts`/`types.ts`/`opportunity-adapter.ts`) y reporta **O1, O2, O3 y O4 «corregido»**, O5 «defecto v0 vigente», sin INESPERADO. La salida v0 congelada (`characterization.json`) no se re-grabó.

### Desvíos (documentados)

- **`tests/acceptance/event-validity.test.ts` (test del ticket 04, no listado en este ticket)**: su paso 2 del caso «predicado O4.1» aseguraba que el defecto de 05 *seguía vigente* sobre la corrida actual — una aserción escrita para volverse obsoleta cuando 05 corrigiera. Se actualizó a esperar el valor DESEADO del oráculo (la narrativa ya no se publica), conservando intactos el paso 1 (la captura congelada sigue mostrando el defecto v0) y el `notDeepEqual` que prueba que las citas realmente cambiaron con 04. Cambio mínimo e inevitable: sin él la suite quedaba roja con la corrección correcta.
- **`lib/api/types.ts` y `lib/api/opportunity-adapter.ts`** no estaban en la lista del ticket: cambios mínimos de consumidor (un campo opcional + passthrough) para que el drawer reciba el estado; ambos ya tenían drift por tickets previos.
- **`globals.css` NO se tocó**: el drawer reusa el estilo `.feed-down` existente para la nota de redacción.

### Decisiones no obvias

- **Rechazo entero, no filtrado**: una decisión con una cita inválida entre varias también se rechaza completa. Filtrar las citas malas y conservar el texto sería otra forma de «arreglar» las citas de una afirmación sin soporte.
- **`narrative` ausente ≠ rechazada**: el pipeline local sobre seeds y el fixture no pasan por la etapa de redacción y no llevan `narrative`; el drawer no muestra nota ahí (esas rutas ya declaran su degradación por warnings). Solo la etapa de redacción emite el estado.
- **La guardia de cifras aplica solo al texto libre del modelo**: las plantillas determinísticas pueden llevar cifras porque salen de hechos admitidos con evidencia.
- **Titular del modelo sigue nombrando la ciudad hipótesis** (p. ej. «Run a community workshop in Bengaluru» con `market.city: null`): es una propuesta de acción, no una afirmación de ubicación factual (la etiqueta «(hypothesis)» de 03 se conserva en la UI). Si se quisiera restringir también eso, es una extensión de la guardia, no de este criterio.
- **`degraded` no se toca**: la degradación explícita del ticket se expresa con warnings + estado de redacción; cambiar el flag habría alterado la política de cache de v0 (fuera de alcance).

### Tests (salida real)

```
$ pnpm --dir frontend test
# tests 69
# suites 0
# pass 69
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4806.410667

$ pnpm --dir frontend lint
$ eslint .
(exit 0)

$ npx tsc --noEmit
(exit 0)

$ pnpm --dir frontend test:baseline
# O1 (02) corregido · O2 (03) corregido · O3 (04) corregido · O4 (05) corregido
# O5 (06): defecto v0 vigente (sin INESPERADO)
# tests 8 · pass 8 · fail 0
```
