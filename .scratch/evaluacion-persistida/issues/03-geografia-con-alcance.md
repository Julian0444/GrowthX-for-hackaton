# 03 — Conservar el alcance geográfico de la evidencia

Status: ready-for-human

**Estado:** autorizado por Julian para implementar (2026-09-07); la autorización reemplaza los avisos previos de «no autorizado».
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [01](./01-congelar-v0-y-oraculos.md).

## Objetivo

Impedir que un país o una ciudad incluida solo en una consulta se presenten como ubicación observada de un evento o una comunidad.

## Aristas de bloqueo

01 → 03: necesita la referencia y las costuras reproducibles de v0.

## Criterios de aceptación

- [x] Un dato de Trends sobre India sigue siendo una observación de país. Si v0 usa Bengaluru como hipótesis de exploración, ese vínculo se etiqueta como inferencia y no como evidencia de actividad urbana.
- [x] La ubicación explícita de una ciudad conserva el alcance de lo observado: ubicación declarada en un perfil no demuestra presencia física ni asistencia a un evento.
- [x] La ciudad de la consulta a Exa no se copia como ubicación factual del resultado. Sin fuente que respalde lugar del evento, ese lugar queda pendiente.
- [x] API, adaptador, mapa y panel no elevan la evidencia a un alcance más preciso. Una hipótesis puede permanecer en exploración con etiqueta visible; no se presenta como evento elegible de inversión.
- [x] El test existente que espera mapear país a ciudad deja de funcionar como prueba de observación urbana. Se preserva la diferencia entre asignar un punto de exploración y verificar un lugar.
- [x] No se incorpora geocodificación, otra fuente ni un scraper para completar vacíos.

## Demostración

Abrir una respuesta con señal exclusivamente nacional y otra con lugar urbano documentado. En el panel se ve por qué una permite afirmar ciudad y la otra no; el resultado de Exa sin lugar permanece incompleto.

## Módulos y archivos probablemente afectados

`frontend/lib/server/pipeline/global-market-search.ts`, `frontend/lib/server/markets/city-catalog.ts`, `frontend/lib/server/discovery/exa-events.ts`, `frontend/lib/server/audit/labels.ts`, `frontend/lib/api/opportunity-adapter.ts`, `frontend/components/atlas/evidence-links.tsx`, `frontend/components/atlas/world-map.tsx`, `frontend/tests/markets/global-market-search.test.ts`.
Nuevo previsto: `frontend/tests/acceptance/geographic-scope.test.ts`.
Adicional autorizado por Julian durante la implementación: `frontend/lib/contracts/growxth.ts` (contrato — `market.city: string | null` y `market.explorationCity` opcional; solo tipos).

## Qué test lo demuestra

`geographic-scope.test.ts` recorre normalización → respuesta → proyección de UI con tres fixtures: país, ciudad explícita y ciudad que aparece únicamente en la query. Una aserción verifica el valor y otra su estado/alcance; comprobar solo el texto de ciudad no alcanza.

## Decisiones abiertas

Ninguna. Mantener información pendiente es un resultado válido; no requiere elegir una fuente nueva.

## Comments

**Implementado 2026-09-07 (autorización explícita de Julian; corrige el oráculo O2 de la referencia de 01).**

### Qué se hizo

- **Contrato (`lib/contracts/growxth.ts`, adicional autorizado):** `market.city` pasa a `string | null` (null = ciudad pendiente) y se agrega `market.explorationCity?: string | null`, documentado como inferencia del sistema que nunca alimenta ubicación factual, elegibilidad ni recomendación de eventos. Solo tipos; el único escritor y todos los lectores de `market` estaban en la lista del ticket.
- **`lib/server/markets/city-catalog.ts`:** los alias se separan en `aliases` (nivel ciudad/metro) y `regionAliases` (estado/provincia/país: `california`, `germany`, `karnataka`, `argentina`, …). Nuevo `resolveMarketCityScoped(location)` devuelve la ciudad junto con su alcance (`city` | `region` | `country`); `resolveMarketCity` conserva su firma y sigue devolviendo la misma ciudad. Nuevo `cityLevelNames(city)` expone nombre + alias urbanos para comprobar si un texto nombra de verdad la ciudad.
- **`lib/server/pipeline/global-market-search.ts`:** las señales de X y GitHub llevan `geoScope` (y X además `declaredLocation`, el texto publicado por la fuente). Un mercado solo afirma `market.city` cuando alguna señal tiene alcance urbano (fila de Trends por ciudad, lugar etiquetado, ubicación declarada que nombra la ciudad) o cuando es candidato curado `prepared`; con señales solo de país/región queda `city: null` + `explorationCity`, y título/subtítulo/headline/campaña hablan del país con la hipótesis etiquetada («exploring …», «city hypothesis: …»). La evidencia de X conserva la declaración original como `location` (antes se sustituía por la ciudad resuelta) y solo es `observed` con lugar etiquetado a nivel ciudad; las razones de X/GitHub citan lo declarado en vez de traducirlo a la ciudad. Los `momentumSignals` declaran base `country` cuando ninguna ubicación es urbana. Filas «de ciudad» de Trends que en realidad nombran una región degradan su base a `country`.
- **`lib/server/discovery/exa-events.ts`:** la ciudad de la consulta ya no se copia al resultado: `location` solo se conserva si la propia página (título/texto) nombra la ciudad o un alias urbano del catálogo; sin eso queda `null` (pendiente) y la razón lo dice («N listings do not name a place; their location is pending»). La ciudad confirmada o, en su defecto, la hipótesis de exploración siguen orientando la búsqueda (necesario además para que el oráculo O3 del ticket 04 conserve su reproducción). Import de city-catalog relativo (no `@/`) para que `node --test` lo resuelva sin gancho de alias.
- **`lib/api/opportunity-adapter.ts`:** con `market.city` null la UI recibe `«<ciudad> (hypothesis)»` como etiqueta visible (mapa, rail, drawer); nunca la hipótesis a secas, y el fallback por subtítulo ya no puede reintroducirla. `country` se conserva para el resaltado del mapa.
- **`components/atlas/evidence-links.tsx`:** cada evidencia muestra su alcance geográfico: la ubicación que la fuente publicó («India», «Berlin, Germany») o, para un listado de evento sin lugar propio, «Location pending» en cursiva. Es lo que la demo pide ver en el panel.
- **Tests:** nuevo `tests/acceptance/geographic-scope.test.ts` (3 casos) recorre normalización → respuesta → proyección de UI con los tres fixtures del ticket (país, ciudad explícita, ciudad solo en la query), con aserciones de valor y de estado/alcance en cada nivel. `tests/markets/global-market-search.test.ts` deja de probar que país→ciudad sea observación urbana: ahora exige `market.city === null` + `explorationCity` para la señal nacional de India y conserva la diferencia con el lugar explícito (London/Buenos Aires).

### Tests (salida real)

- Rojo/verde verificado: `geographic-scope.test.ts` corrido contra v0 sin corregir → 3/3 en rojo (`presentedAsCity 'Bengaluru'`, `location 'Bengaluru'` en el resultado sin lugar); con la corrección → 3/3 en verde.
- `pnpm --dir frontend test` → `# tests 52 · # pass 52 · # fail 0` (49 previos + 3 nuevos).
- `pnpm --dir frontend test:baseline` (modo diagnóstico, fuentes con drift esperado del manifiesto) →
  `O2 (ticket 03) corregido` en sus dos predicados; `O1 corregido` (02) y `O3/O4/O5 defecto v0 vigente` (04–06), sin estados INESPERADO. `characterization.json` y el manifiesto no se regeneraron.
- `pnpm --dir frontend lint` → exit 0, sin avisos. `npx tsc --noEmit` → exit 0.

### Desvíos y notas

- **Archivo adicional:** `lib/contracts/growxth.ts`, autorizado explícitamente por Julian al detectar que O2 (`market.city = null`) era incumplible con `city: string` requerido. `lib/api/types.ts` no se tocó (la etiqueta legacy es un string).
- **Sin cambios en `labels.ts` y `world-map.tsx`** (listados como «probablemente afectados»): la auditoría de labels ya es correcta —la página de Exa sigue `observed` por URL+fecha; lo que cambia es que su `location` puede quedar pendiente— y el mapa recibe la etiqueta desde el adaptador y resalta por `country`, que se conserva.
- **Candidatos `prepared`:** conservan `market.city` — son candidatos curados con etiqueta visible (`status: prepared`), no una inferencia desde señal nacional; el test de fallback existente sigue igual.
- **Cambio de comportamiento menor en la resolución:** la pasada por alias urbanos ahora precede a la de región, así «Mumbai, Maharashtra» resuelve Mumbai (antes Pune, por el alias de estado). Ninguna grabación ni test dependía del comportamiento anterior.
- Sin geocodificación, fuentes nuevas ni scraper: los vacíos quedan pendientes, como pide el ticket.
