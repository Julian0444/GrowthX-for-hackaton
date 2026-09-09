# 06 — Quitar al LLM la autoridad sobre el orden y los scores

Status: ready-for-human

**Estado:** implementado (autorización explícita de Julian en sesión, 2026-09-08; cubrió solo este ticket); pendiente de revisión humana.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [01](./01-congelar-v0-y-oraculos.md).

## Objetivo

Garantizar que el orden visible y los scores se mantengan aunque el modelo devuelva otro ranking.

## Aristas de bloqueo

01 → 06: necesita la referencia y las costuras reproducibles de v0.

## Criterios de aceptación

- [x] Se elimina `rank` de las instrucciones y del contrato de salida útil de Gemini; datos inesperados no se convierten en autoridad.
- [x] La aplicación de la redacción conserva IDs, orden, scores y breakdown determinísticos. No ordena el array a partir de la respuesta del modelo.
- [x] Un modelo que devuelve candidatos invertidos, repetidos, desconocidos, omitidos o con campos de score no crea oportunidades, no pierde las válidas y no cambia sus posiciones.
- [x] Se documenta y prueba el desempate determinístico; ni orden de llegada del proveedor ni una segunda redacción lo modifican.
- [x] El adaptador que genera `rank: index + 1` para la UI refleja el orden oficial; no introduce una segunda decisión.
- [x] En ausencia de modelo el orden permanece idéntico, con estado de redacción degradada. La prueba compara toda la proyección relevante y no solo los valores numéricos.

## Demostración

La misma búsqueda se renderiza con un modelo que solicita el orden inverso y con otro que falla. El rail y el mapa mantienen el orden producido por el scorer.

## Módulos y archivos probablemente afectados

`frontend/lib/server/reasoning/gemini.ts`, `frontend/lib/server/pipeline/global-market-search.ts`, `frontend/lib/server/pipeline/search-opportunities.ts`, `frontend/lib/api/opportunity-adapter.ts`, `frontend/components/atlas/result-rail.tsx`.
Nuevo previsto: `frontend/tests/acceptance/llm-rank-authority.test.ts`.

## Qué test lo demuestra

`llm-rank-authority.test.ts`: evaluación determinística conocida → payloads adversariales del modelo → respuesta y proyección del rail. El test debe fallar con la ordenación por `rank` de la v0 congelada.

## Decisiones abiertas

**DECISIÓN ABIERTA D2:** política comercial de scoring v1. Este ticket no la elige ni modifica pesos de v0: elimina una segunda autoridad sobre sus resultados.

## Comments

### Qué se hizo

**`lib/server/reasoning/gemini.ts`** (corrección del oráculo O5):

- `rank` eliminado del contrato de salida útil (`RESPONSE_SCHEMA`: propiedad y `required`), de las instrucciones (se quitó el bullet «rank: 1 = best market…» y se reformuló el encabezado: el modelo escribe la narrativa POR candidato; «the ordering of markets is already decided by the deterministic scorer and is not yours to change») y del parseo (`GeminiDecision` ya no tiene `rank`). `parseDecisions` copia SOLO los campos del contrato útil: cualquier dato inesperado que el modelo devuelva (un `rank`, un `score`) se descarta sin convertirse en autoridad.
- Se eliminó el sort por `rank` de la rama con decisiones validadas (el defecto O5). La redacción se aplica POR ID posición a posición sobre el array oficial y devuelve `reviewed` tal cual: conserva IDs, orden, scores y breakdown determinísticos. Decisión repetida para un id: la última gana sin duplicar la oportunidad (documentado en el código); candidato desconocido: jamás crea una oportunidad; candidato omitido: conserva su explicación con `narrative: deterministic_only` (comportamiento de 05, ahora sin reordenar).
- Los warnings y estados de redacción de 05 se conservan tal cual: las ramas «todas rechazadas» y de fallo ya no ordenaban; ahora ninguna rama lo hace.

**`lib/server/pipeline/global-market-search.ts`** y **`lib/server/pipeline/search-opportunities.ts`** — desempate determinístico, documentado en el código junto a cada sort: ante empate exacto del comparador v0 (mismo score o, en la rama de ubicación, misma distancia) decide el **id estable** de la oportunidad (comparación por puntos de código, ajena al locale). Antes el empate caía en el orden de inserción del array — es decir, el orden de llegada de las señales del proveedor (ranking mundial) o de los candidatos del grafo (pipeline local) vía sort estable. La política de scoring v0 no cambia (D2): el desempate solo actúa donde el comparador v0 decía «iguales».

**`lib/api/opportunity-adapter.ts`**: sin cambio de comportamiento; se documenta sobre `rank: index + 1` que es la proyección del orden oficial recibido y que el adaptador no reordena ni introduce una segunda decisión de ranking.

**`components/atlas/result-rail.tsx`**: sin cambios (listado como probablemente afectado). El rail renderiza el array en su orden y muestra el `rank` que entrega el adaptador; corregido el orden aguas arriba no hay nada que tocar. Ídem el mapa: consume el mismo array legacy.

**Test nuevo — `frontend/tests/acceptance/llm-rank-authority.test.ts`** (6 casos; evaluación determinística conocida → payloads adversariales del modelo → respuesta y proyección del rail):

1. Contrato/instrucciones: captura el cuerpo enviado al proveedor y verifica que ni el `responseSchema` ni el prompt piden `rank`; una decisión sin `rank` se valida y aplica igual, sin tocar el orden.
2. Grabación adversarial de 01 (verifica su premisa leyendo `providers/gemini.json`: rank exactamente inverso, candidato desconocido `opp-global-nowhere`, campo `score: 99`): O5.1/O5.2/O5.3 en su valor deseado — orden visible igual al determinístico, proyección completa posición a posición (ids, scores, breakdown, razones) idéntica con y sin modelo, el `score` del modelo no pisa el oficial, y el `rank` del adaptador (rail y mapa) refleja el orden oficial.
3. Inyectados: repetidos (dos decisiones para Berlín), omitidos (Bengaluru), desconocidos (`opp-global-atlantis`) y con campos `rank`/`score` espurios → no crean oportunidades, no pierden las válidas, no cambian posiciones; una **segunda redacción** sobre la respuesta ya redactada pidiendo el orden inverso tampoco lo modifica.
4. Desempate del ranking mundial: Singapore y Tokyo (hubWeight idéntico en el catálogo, verificado en el test) con la misma señal de Trends → empate real de score; las señales en orden de llegada invertido producen el MISMO orden oficial, resuelto por id estable.
5. Desempate del pipeline local: grafo espejo (dos comunidades/eventos idénticos salvo ids) en distinto orden de arrays → mismo orden oficial, empate real verificado, resuelto por id estable.
6. Ausencia de modelo (sin clave y con proveedor caído): orden idéntico, `deterministic_only` declarado por oportunidad y warning visible; la proyección legacy completa del rail/mapa se compara campo a campo (solo se normaliza `narrative`, cuya nota distingue el motivo de degradación) — no solo los valores numéricos.

### Rojo/verde verificado

El test se escribió primero y se corrió contra el código sin corregir: **5/6 en rojo**, fallando exactamente en el defecto (contrato con `rank`; orden invertido por la grabación — «la ordenación por rank de la v0 congelada» que el ticket exige que falle; posiciones movidas por ranks inyectados; los dos empates volteados por el orden de llegada). El caso 6 ya estaba verde: la degradación sin modelo la dejó correcta 05. Con la corrección: **6/6 en verde**.

`pnpm --dir frontend test:baseline` (modo diagnóstico, drift esperado; las cuatro fuentes tocadas ya tenían drift de 02–05, no se suma ninguna nueva): **O1–O5 «corregido»** (O1.3 y O5.13 «invariante»: v0 y deseado coinciden), sin INESPERADO. `characterization.json` y `manifest.json` sin re-grabar. **Los cinco oráculos quedan activos y verdes — precondición de 07+ cumplida.**

### Desvíos (documentados)

- Ninguno fuera de la lista del ticket: los cuatro archivos tocados están listados, `result-rail.tsx` (listado) no necesitó cambios y el test nuevo es el previsto. No se tocó ningún test previo ni el harness.
- **Cambio de comportamiento menor y deliberado (desempate)**: donde v0 empataba exacto, el orden pasa de «orden de llegada» a «id estable». En la salida congelada no hay empates entre las tres oportunidades globales (84/82/75), así que la repetición no cambia; el único empate preexistente en la suite (fallback all-prepared del ranking mundial, tres ciudades en score 40) se asevera por conjunto de países, no por posición, y sigue verde.

### Decisiones no obvias

- **El desempate vive en los sorts de los pipelines, no en una etapa nueva**: el lugar del defecto eran los comparadores que devolvían 0 y dejaban la decisión al orden de inserción del sort estable.
- **`reasoning-support.test.ts` (05) quedó intacto**: sus aserciones de orden en degradación y todas-rechazadas siguen verdes tras quitar el sort, como preveía la nota de interdependencia 05↔06; el caso con validadas no aseguraba orden a propósito y ahora lo asegura este ticket.
- **D2 intacta**: no se eligió política comercial ni se tocaron pesos/umbrales/fórmulas de v0; se eliminó la segunda autoridad (el modelo) sobre sus resultados y se volvió determinístico el caso «iguales».

### Tests (salida real)

```
$ pnpm --dir frontend test
# tests 75
# suites 0
# pass 75
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4750.914875

$ pnpm --dir frontend lint
$ eslint .
(exit 0)

$ npx tsc --noEmit
(exit 0)

$ pnpm --dir frontend test:baseline
# O1 (02) corregido · O2 (03) corregido · O3 (04) corregido · O4 (05) corregido · O5 (06) corregido
# (O1.3 y O5.13 invariantes; sin INESPERADO)
# tests 8 · pass 8 · fail 0
```
