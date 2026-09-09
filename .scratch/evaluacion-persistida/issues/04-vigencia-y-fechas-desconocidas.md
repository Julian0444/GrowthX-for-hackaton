# 04 — Excluir eventos vencidos y conservar fechas desconocidas

Status: ready-for-human

**Estado:** implementado (autorización explícita de Julian en sesión); pendiente de revisión humana.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [01](./01-congelar-v0-y-oraculos.md).

## Objetivo

Evitar que el pipeline o la UI conviertan un evento pasado o sin fecha verificable en una oportunidad futura.

## Aristas de bloqueo

01 → 04: necesita la referencia y las costuras reproducibles de v0.

## Criterios de aceptación

- [x] Con reloj fijado, un evento vencido no aparece entre oportunidades futuras elegibles ni como «próximo evento». Puede seguir consultándose como antecedente histórico, claramente identificado.
- [x] Una fecha ausente, inválida o con zona ambigua permanece pendiente; el adaptador no la reemplaza por `new Date()`.
- [x] Se distingue fecha del evento de fecha de publicación y de obtención. La publicación reciente de una página antigua no rejuvenece el evento.
- [x] Los casos cerca de medianoche y con zona horaria explícita producen una clasificación consistente entre servidor y UI. La política de corte usa el instante de evaluación y la ventana de participación declarada; la incertidumbre no se resuelve inventando zona.
- [x] Los fallbacks del servidor y del cliente no reintroducen fixtures históricos como oportunidades vigentes cuando falla la búsqueda.
- [x] Los seeds quedan intactos como datos históricos. No se hace scraping para reemplazarlos en este ticket.

## Demostración

Con el mismo reloj se muestran cuatro eventos: futuro confirmado, pasado, sin fecha y fecha ambigua. Solo el primero supera la regla temporal; los demás tienen un motivo visible. Cambiar el reloj permite demostrar que una oportunidad puede caducar.

## Módulos y archivos probablemente afectados

`frontend/lib/server/graph/derive-signals.ts`, `frontend/lib/server/pipeline/search-opportunities.ts`, `frontend/lib/server/discovery/exa-events.ts`, `frontend/lib/api/opportunity-adapter.ts`, `frontend/lib/api/luma.ts`, `frontend/lib/api/types.ts`, `frontend/lib/api/atlas-client.ts`, `frontend/components/atlas/event-import.tsx`.
Nuevos previstos: `frontend/tests/acceptance/event-validity.test.ts` y una política temporal pequeña reutilizable por el slice.

## Qué test lo demuestra

`event-validity.test.ts` verifica clasificación y salida del adaptador con reloj inyectado, fechas límite y fallback sin red. Un fixture sin fecha reproduce el defecto de «fecha actual». Las pruebas de 12 reutilizan esta regla para elegibilidad antes del score.

## Decisiones abiertas

**DECISIÓN ABIERTA D2:** restricciones particulares de calendario del cliente. No bloquea eliminar fechas inventadas ni excluir eventos inequívocamente vencidos.

## Comments

### Qué se hizo

**Política temporal nueva — `frontend/lib/temporal/event-validity.ts`** (la «política pequeña reutilizable por el slice»; sin imports de servidor, la comparten pipeline, adaptador y componentes cliente):

- `classifyEventValidity(startsAt, evaluationInstant)` → `upcoming | past | date_pending | date_ambiguous`, con motivo visible (`reason`) y rango UTC posible del inicio (`startRange`).
- Corte = instante de evaluación vs. inicio declarado (para decidir un patrocinio, la ventana de participación se cierra al empezar el evento). Refinar con `endsAt`/restricciones del cliente queda para la DECISIÓN ABIERTA D2, como prevé el ticket.
- Sin zona explícita no se inventa: la fecha se evalúa contra el rango real de offsets UTC (−12:00 … +14:00). Solo es `past`/`upcoming` si lo es bajo cualquier zona posible; si el instante de evaluación cae dentro del rango, queda `date_ambiguous` (pendiente). Solo-fecha evalúa el día completo. Ausente/ inválida → `date_pending`, nunca `new Date()`.

**`lib/server/graph/derive-signals.ts`**: `deriveRuntimeGraph` acepta `evaluationInstant` (default: ahora; congelable con el reloj inyectado), clasifica cada evento y elige el candidato por comunidad solo entre eventos `upcoming` cuando existen (un vencido con mejor fit ya no tapa a un futuro); sin eventos vigentes, el mejor histórico queda como candidato marcado (`eventValidity` en `RuntimeCommunity`). El excerpt de la evidencia Luma solo dice «Upcoming» cuando la política lo respalda; un vencido queda «Past event … historical antecedent» (obtención `fetchedAt` intacta y distinguida de la fecha del evento).

**`lib/server/pipeline/search-opportunities.ts`**: elegibilidad temporal ANTES del score — un candidato no-`upcoming` no se convierte en oportunidad (vencido → antecedente histórico; sin fecha/ambigua → pendiente), con warnings que dan el motivo visible y conteo. La evidencia/sourcesUsed se registran igual que en v0 para todos los candidatos evaluados (cobertura idéntica a la caracterización); la razón «upcoming» de Luma ahora es siempre verdadera.

**`lib/server/discovery/exa-events.ts`**: la vigencia de cada resultado se decide por la fecha del EVENTO nombrada en la propia página («15 October 2026», «held on 12 August 2026», ISO), nunca por `publishedDate` ni por la fecha de obtención: la publicación reciente de una página vieja no rejuvenece el evento. Páginas cuyo(s) fecha(s) ya pasaron bajo cualquier zona = recap histórico: quedan como Evidence consultable (URL + publicación intactas, `observed`) pero NO se citan en la razón de listados; la razón lo dice («kept as historical antecedents, not cited as live listings») y declara pendientes las fechas/lugares ausentes de lo citado.

**`lib/api/opportunity-adapter.ts`**: `toEvents` clasifica con la política en el instante de proyección; solo un evento `upcoming` con inicio verificable se presenta como «próximo evento» (una oportunidad puede caducar entre snapshot y vista). Fecha ausente ya NO se reemplaza por `new Date()`: el contrato crudo conserva `startsAt: null` (pendiente) y la proyección legacy no fabrica el evento. La fuente sintética (sin evidencia Luma citada) usa `generatedAt` del snapshot en vez de `new Date()` y pasa a `isEstimated: true` (no hay observación que la respalde).

**`lib/api/atlas-client.ts`**: el fallback del cliente identifica el material preparado: cuenta con la política los eventos del fixture ya ocurridos y agrega el warning «N eventos del fixture ya ocurrieron; son antecedentes históricos, no oportunidades vigentes».

**`components/atlas/event-import.tsx`**: el evento importado de Luma muestra identificación temporal visible con la misma política (nota «Already happened — historical antecedent…», «Date pending…» o «Date has no timezone…»); `""` del parser se trata como fecha ausente.

**Test nuevo — `frontend/tests/acceptance/event-validity.test.ts`** (8 casos): política pura (límites, medianoche con zona explícita, sin zona, solo-fecha, inválidas); demo de los cuatro eventos con el mismo reloj (solo el futuro supera la regla, motivos visibles, mover el reloj lo caduca y la ambigua se vuelve inequívocamente pasada); seeds con reloj congelado (0 vencidos citados como «upcoming», predicado O3); adaptador (ausente→null, vencido no proyectado, futuro proyectado sin observedAt fabricado); Exa (recap no citado como vivo, publicación conservada, listado sin fecha sigue citado como pendiente); estabilidad del predicado O4.1; fallbacks del servidor (resolver con pipelines caídos, sin red) y del cliente (fetch fallido) — el fixture histórico no vuelve como vigente y el dato crudo queda como antecedente.

### Rojo/verde verificado

El test se escribió primero (junto con la política, módulo nuevo) y se corrió contra la v0 sin corregir: **6/7 en rojo** (solo la política pura, que no existe en v0, en verde). Con las correcciones: **8/8 en verde** (se sumó el caso de estabilidad de O4.1). Como preveían 01–03, `baseline-v0.test.ts` sigue en modo diagnóstico (drift esperado, ahora incluye `search-opportunities.ts` y `derive-signals.ts`) y reporta **O1, O2 y O3 «corregido»**, O4/O5 «defecto v0 vigente», sin INESPERADO. La salida v0 congelada (`characterization.json › replay/deterministic/local`) no se re-grabó.

### Desvío autorizado: predicado O4.1 (harness de 01)

Al dejar de citar el recap vencido, cambió el conjunto de «citas propias de Berlín» y el predicado O4.1 —que documentaba su v0 con la lista literal de ids recalculada en vivo— rompía «el valor v0 documentado no cambió». Julian autorizó en sesión (AskUserQuestion) tocar `tests/fixtures/baseline-v0/harness.ts` y la entrada `oracles.O4.8` de `characterization.json`, con condiciones que se cumplieron así:

- El predicado ahora es conductual: `narrativeSubstitutionObservable(publishedIds, ownIds)` → `{ published, substitutedWithOwnCitations }` (publicada + citas tomadas del conjunto propio, no la cita inexistente). No depende de cantidad ni lista accidental de ids.
- El v0 documentado es la constante `{ published: true, substitutedWithOwnCitations: true }`, derivada de la captura congelada (el test de estabilidad lo verifica aplicando el predicado a `characterization.json` mismo, nunca al pipeline actual). Solo se actualizó esa entrada de `oracles`; la salida v0 congelada quedó intacta.
- El caso «cambian las citas disponibles sin cambiar el comportamiento» está en `event-validity.test.ts`: sobre la corrida actual las citas difieren de las congeladas (se demuestra con `notDeepEqual`) y el veredicto sigue siendo el defecto v0; no publicar produce exactamente el valor deseado (corrección de 05 verificable) y publicar conservando la cita inexistente daría INESPERADO.

### Otras decisiones y desvíos

- **`lib/api/luma.ts` y `lib/api/types.ts` sin cambios** (listados como probablemente afectados): el parser ya deja la fecha ausente como pendiente con warning y sin inventar nada; la identificación visible la hace `event-import.tsx` con la política. Cambiar `EventOpportunity.startsAt` a `string | null` habría arrastrado a `opportunity-drawer.tsx` (fuera del alcance); en su lugar, la proyección legacy solo emite eventos `upcoming` con fecha real, y «pendiente» se expresa no fabricando el evento (el contrato crudo, que sí admite `null`, lo conserva).
- **El fallback del servidor no requirió tocar `resolve.ts`**: el punto de contención es el adaptador (ambos fallbacks fluyen por él hacia la UI); el test lo demuestra con `createSearchResolver` y pipelines caídos.
- **Semántica del corte**: vencido = inicio declarado anterior al instante de evaluación bajo cualquier zona posible (coincide con el predicado O3 de la referencia). Un evento que empieza exactamente en el instante de evaluación no está vencido.
- **Cambio de comportamiento menor del fixture fallback**: la fuente sintética del adaptador pasa de `isEstimated: false` con `new Date()` a `isEstimated: true` con `generatedAt` (más honesto; ningún test dependía de lo anterior).
- Interdependencia 03↔04 respetada: la búsqueda `exa:Bengaluru` sigue ocurriendo y el recap se sirve desde la grabación con `citedAsLive: false`.

### Tests (salida real)

```
$ pnpm --dir frontend test
# tests 60
# suites 0
# pass 60
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4691.211208

$ pnpm --dir frontend lint
$ eslint .
(exit 0)

$ npx tsc --noEmit
(exit 0)

$ pnpm --dir frontend test:baseline
# O1 (ticket 02) corregido · O2 (ticket 03) corregido · O3 (ticket 04) corregido
# O4/O5: defecto v0 vigente (sin INESPERADO)
# tests 8 · pass 8 · fail 0
```
