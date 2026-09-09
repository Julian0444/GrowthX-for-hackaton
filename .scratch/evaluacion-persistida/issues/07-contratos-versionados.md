# 07 — Definir y validar los contratos del recorrido persistido

Status: ready-for-human

**Estado:** autorizado por Julian para implementar (2026-09-08; la autorización cubre solo este ticket).
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [02](./02-cache-respeta-presupuesto.md), [03](./03-geografia-con-alcance.md), [04](./04-vigencia-y-fechas-desconocidas.md), [05](./05-explicaciones-con-soporte.md), [06](./06-orden-solo-deterministico.md).

## Objetivo

Establecer contratos versionados de perfil, evidencia por claim, snapshot, decisión y campaña que conserven incertidumbre y permitan una lectura fiel desde PostgreSQL.

## Aristas de bloqueo

02, 03, 04, 05 y 06 → 07: puerta de calidad del hito 1 del ADR; sus cinco oráculos deben estar activos y verdes antes de sustituir la representación actual.

## Criterios de aceptación

- [x] Los contratos de la especificación tienen validación de runtime y versión explícita. Payloads inválidos se rechazan; una versión desconocida no se interpreta silenciosamente como la actual.
- [x] Perfil distingue presupuesto desconocido de cero, moneda, fechas, audiencia y objetivo provisional/confirmado; la definición de éxito puede estar pendiente sin convertirse en adopción.
- [x] Fuente, claim y revisión separan lo anunciado de lo observado, inferido, confirmado, pendiente y contradicho. Incluyen alcance geográfico, método, fechas distintas, restricciones de uso, localizador de soporte y relación de revisión.
- [x] El snapshot fija perfil y revisiones de evidencia, elegibilidad, política, orden, condiciones y, cuando corresponde, score, cobertura y sensibilidad. Distingue «sin política» de score cero y «sin evento elegible» de error técnico.
- [x] La decisión guarda elegir/descartar/pendiente, autor del servidor, motivos y condiciones; el borrador de campaña distingue estimación/objetivo/compromiso acordado y exige soporte para lo acordado.
- [x] En campaña caben modalidad y costos parciales/desconocidos sin inventar costo total ni ROI. La definición de éxito es texto; no aparecen contratos de ingestión de outcomes.
- [x] Hay ejemplos de ida y vuelta por JSON y una proyección de lectura compatible con mapa/panel/campaña. Esa proyección permite fecha/ubicación/score desconocidos sin recurrir a defaults engañosos del contrato legado.
- [x] Reglas de validación de objetos se distinguen de integridad relacional: pertenencia al tenant y referencias existentes se comprobarán en 08 y 09, no se «prueban» solo con un validador JSON.

## Contratos adicionales del foco SF

- [x] Organizador, edición, empresa y relación con rol documentado son identidades separadas; aliases requieren confirmación. Un logo ambiguo no crea patrocinio ni resultados.
- [x] El perfil admite empresas comparables indicadas y confirmadas por el cliente. El snapshot incluye revisiones de organizador/relaciones y distingue investigación de organizadores de comparación de inversiones.
- [x] La proyección sirve al dashboard, lista de organizadores, dossier, campaña y mapa local secundario. Afinidad, reputación y resultado comercial no son campos intercambiables.

## Demostración

Leer un ejemplo de perfil y dossier incompleto, serializarlo, validarlo y producir la proyección que consume la UI conservando sus pendientes. Este es el único ticket preparatorio de contratos: evita mezclar el cambio de significado de cinco objetos con las transacciones y el worker del siguiente recorrido.

## Módulos y archivos probablemente afectados

`frontend/lib/contracts/growxth.ts`, `frontend/lib/api/types.ts`, `frontend/lib/api/opportunity-adapter.ts`.
Nuevos previstos: `frontend/lib/contracts/evaluation.ts`, `frontend/lib/contracts/evaluation-validation.ts`, `frontend/tests/contracts/evaluation.test.ts`. Se permite agregar un validador pequeño como dependencia; la elección no reabre frameworks de agentes.

## Qué test lo demuestra

`evaluation.test.ts` con payload válido, fecha incierta, costo incompleto, país, contradicción, score ausente, compromiso sin soporte, versión desconocida y round-trip. Una prueba de proyección demuestra que «pendiente» llega a la pantalla sin convertirse en 0, hoy o una ciudad.

## Decisiones abiertas

**DECISIÓN ABIERTA D1:** objetivo y definición de éxito del comprador.
**DECISIÓN ABIERTA D2:** política numérica aplicable. Ambas se representan explícitamente; no bloquean los contratos ni se resuelven inventando pesos.

## Comments

**Implementado 2026-09-08 (sesión Claude, autorización explícita de Julian para este ticket). Sin commit ni push: los hace Julian.**

### Qué se hizo

- **`frontend/lib/contracts/evaluation.ts` (nuevo, solo tipos):** contratos versionados de perfil, fuente/claim/revisión, organizador/edición/empresa/participación, snapshot, decisión y borrador de campaña, más el bundle de lectura y la proyección (`EvaluationReadProjection`). Todo payload persistible lleva `contractVersion: '1'`. La incertidumbre es estructural: `BudgetDeclaration` (desconocido ≠ 0, moneda explícita), `DeclaredDate` (instant/date_only/ambiguous/unknown, zona o ambigüedad explícita), `MoneyClaim` (quoted/estimated/unknown), `PolicyRef` (`none` con nota ≠ score 0), `SnapshotOutcome` (`no_eligible_candidates` ≠ `technical_failure`), `SnapshotOrdering` (`ranked` solo con política; si no, `presentation_only`), `ObjectiveDeclaration` (provisional/confirmado, `successDefinition` pendiente sin default). Sin campos opcionales: todo campo está presente con `null` explícito, para lectura fiel desde PostgreSQL. La campaña **no tiene** campos de costo total ni ROI (su ausencia es parte del contrato) y no hay tipos de ingestión de outcomes. Organizador/edición/participación siguen el mismo patrón de revisión que los claims (id de revisión + identidad estable + `previousRevisionId`), para que el snapshot fije revisiones de organizadores y relaciones. Reutiliza `NarrativeState` de growxth (ticket 05) como estado de redacción del snapshot.
- **`frontend/lib/contracts/evaluation-validation.ts` (nuevo):** validación de runtime con combinadores propios pequeños (object estricto, uniones discriminadas, refine). `parse<Contrato>()` por agregado + `parseEvaluationReadBundle`. La versión se comprueba ANTES que la forma: versión desconocida → un único error propio, sin seguir validando como v1. Claves que v1 no define se rechazan (no se leen payloads futuros «ignorando lo raro»). Reglas de coherencia interna: claim `contradicted` exige motivo; estados que afirman (`announced/reported/observed/confirmed/contradicted`) exigen fuentes; `inferred` exige método; valor `pending` no lleva estado afirmativo; alias `confirmed` exige soporte; coordenadas exigen alcance urbano; `paid_sponsor` no se infiere; `logo_present` no lleva resultado comercial; snapshot no puntúa sin política y su orden ordena exactamente sus alternativas; compromiso `agreed` exige método + evidencia (y estimación/meta no llevan confirmación); decisión exige motivos, autor `server_session` y relación de revisión coherente.
- **`frontend/lib/api/opportunity-adapter.ts`:** nueva sección `projectEvaluationRead(bundle)` → proyección para dashboard, lista de organizadores, dossier, campaña y mapa local secundario. `ProjectedField` (known/ambiguous/pending con estado del claim, alcance, obtención y «qué falta confirmar») reemplaza los defaults engañosos del contrato legado: fecha desconocida queda `pending` (sin display), día sin zona queda `ambiguous`, alcance país muestra el país con «ciudad pendiente» y NO produce punto en el mapa (queda en `listedWithoutPoint` con motivo), score sin política llega como `no_policy` (sin número), presupuesto desconocido como `pending`. La lista de organizadores separa aliases confirmados de propuestos y no expone reputación.
- **`frontend/lib/contracts/growxth.ts` y `frontend/lib/api/types.ts`:** solo notas de frontera (documentación): growxth sigue siendo la frontera v0; los campos obligatorios engañosos del legacy (`city`, `score`, `startsAt`) quedan confinados a la vista v0 y el recorrido persistido lee `EvaluationReadProjection`.
- **`frontend/tests/contracts/evaluation.test.ts` (nuevo, 14 casos):** todos los exigidos por el ticket — payload válido, inválidos con ruta/motivo (incluye `totalCostUsd`/`roi`/`reputationScore` como claves rechazadas), versión desconocida (`'2'` y ausente; un solo issue, el de versión), fecha incierta, costo incompleto, país, contradicción, score ausente + `no_eligible_candidates` ≠ `technical_failure`, compromiso acordado sin soporte, identidades/aliases/logo, decisión (autor de servidor, motivos, revisión), integridad relacional fuera de alcance (fuente irresoluble = objeto válido, proyección sin `obtainedAt` fabricado), round-trip por JSON (deepEqual + proyección idéntica) y la proyección de pendientes (presupuesto pendiente sin número, éxito pendiente sin volverse `adoption` —no aparece en toda la lectura—, elección condicional visible, presentación ≠ ranking).

### Demostración del ticket

El test principal construye un perfil y dossier incompletos (presupuesto desconocido, D1 provisional con éxito pendiente, D2 sin política, edición con día sin zona y alcance país, edición sin fecha, costo sin cotizar, claim contradicho), lo serializa por JSON, lo revalida y produce la proyección conservando cada pendiente.

### Tests (salida real)

- `pnpm --dir frontend test` → **89 pass / 0 fail** (75 previos + 14 nuevos), `duration_ms 4733`.
- `pnpm --dir frontend lint` → exit 0.
- `npx tsc --noEmit` → exit 0.
- `pnpm --dir frontend test:baseline` (diagnóstico) → 8 pass / 0 fail, **O1–O5 «corregido»**, sin INESPERADO (07 no toca el pipeline; el drift del adaptador ya existía por 03–06).

### Desvíos y decisiones

- **Sin dependencia nueva:** el ticket permitía un validador pequeño como dependencia; no hizo falta (combinadores propios de ~150 líneas, `package.json` intacto).
- **Alcance:** solo los cinco archivos nombrados por el ticket + el test nuevo. En `growxth.ts` y `types.ts` el cambio es únicamente documentación de frontera.
- **Patrón de revisión uniforme** (claim/organizador/edición/participación) en lugar de revisiones solo para claims: lo pide el criterio SF («el snapshot incluye revisiones de organizador/relaciones») y simplifica 08/09.
- **Claves desconocidas se rechazan** (no se ignoran): coherente con «una versión desconocida no se interpreta como la actual» y permite demostrar por test que costo total/ROI/reputación no pueden colarse.
- La proyección asume bundle ya validado y **no** resuelve referencias: una revisión no incluida en la lectura se proyecta como pendiente honesto («revisión no incluida en la lectura»), nunca como valor inventado.
- `plan/handoff.md` no se tocó (fuera del alcance de archivos autorizado); si querés la sección de sesión, pedila aparte.
