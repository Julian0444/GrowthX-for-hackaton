# Referencia congelada v0 — matriz de oráculos

Ticket: [01 — Congelar v0 y preparar los oráculos de aceptación](../../../../.scratch/evaluacion-persistida/issues/01-congelar-v0-y-oraculos.md).
Especificación: [evaluación persistida de SF](../../../../.scratch/evaluacion-persistida/spec.md).

Este directorio conserva **cómo se comportaba la v0** y **qué debería pasar en su lugar**. Congelar significa preservar la comparación, no aceptar los defectos: `characterization.json` no se re-graba cuando 02–06 corrigen el código, y `baseline-v0.test.ts` exige la igualdad con esa salida solo mientras los hashes de `manifest.json` coincidan con las fuentes.

## Cómo repetir

```bash
pnpm --dir frontend test:baseline    # solo la referencia
pnpm --dir frontend test             # suite completa (incluye la referencia)
```

Sin red ni claves reales: el harness (`harness.ts`) congela `Date` en `evaluationClock`, sustituye `fetch` por un transporte que sirve `providers/*.json` y falla ante cualquier URL no grabada, y fija claves falsas (`FAKE_KEYS`) para que el código recorra las ramas con proveedor. Restaura todo al salir.

| Elemento | Valor |
| --- | --- |
| Instante de congelación / reloj de evaluación | `2026-09-07T22:28:00.000Z` (documentado al implementar; no es el día de la demo ni el del plan) |
| Commit | `480712c` sobre árbol de trabajo con cambios locales (ver `manifest.json › commit`) |
| Perfil | `AI observability for production agents` · stack `Python, Kubernetes` · USD 2.000 · objetivo `adoption` |
| Seeds | 136 eventos (64 SF + 72 NYC), hashes en el manifiesto; en el reloj congelado 63 SF y 66 NYC ya vencidos |
| Grabaciones | `providers/` — respuestas controladas (status `prepared`), no observaciones reales de Apify, GitHub, Exa ni Gemini |

Costura de runtime abierta por este ticket: `createSearchResolver(overrides)` en `lib/server/pipeline/resolve.ts` permite inyectar pipelines, fixture, auditoría y cache aislada. `searchOrFixture` sigue siendo la instancia por defecto con cache compartida.

## Política y significado de los scores

Versión: **v0, sin versionado en código**; queda congelada por los hashes de `lib/server/scoring/*` y `lib/server/pipeline/global-market-search.ts` (fórmulas y pesos en `manifest.json › policy`).

- El score de mercado (`rankGlobalMarkets`) mide interés y actividad pública para el término del producto en una geografía: Google Trends, perfiles de X con ubicación declarada y owners de repos con ubicación declarada. El score local (`searchOpportunities`) promedia un score de comunidad y uno de tema sobre seeds de Luma.
- **Un score de comunidad/mercado no es un score de evento**: no evalúa una edición concreta, su fecha, acceso ni costo. **No es una política de recruiting** ni de ningún objetivo del intake: el `goal` solo aparece como palabra en el prompt del modelo, nunca en el scorer. No es probabilidad de éxito; `confidence` es un promedio de la confianza de la evidencia citada.
- v0 no tiene elegibilidad previa al score: no excluye por fecha vencida, costo ni acceso.

## Matriz

Cada oráculo tiene predicados ejecutables en `observeOracles()` (`harness.ts`), con el valor que da v0 y el deseado. Sobre v0 la observación es el defecto; 02–06 escriben la prueba roja sobre esta referencia y verde sobre su corrección. Los valores v0 observados están en `characterization.json › oracles`.

| Oráculo | Defecto en v0 | Dónde | Salida v0 (observada) | Salida deseada | Ticket |
| --- | --- | --- | --- | --- | --- |
| O1 | La clave de cache y la promesa en curso omiten `budgetUsd`: una búsqueda con USD 20.000 recibe la respuesta generada para USD 2.000 | `resolve.ts › cacheKey` | `query.budgetUsd = 2000` en la segunda petición, secuencial y concurrente | `query.budgetUsd = 20000`; peticiones equivalentes sí reutilizan | [02](../../../../.scratch/evaluacion-persistida/issues/02-cache-respeta-presupuesto.md) |
| O2 | Señal nacional (Trends «India») presentada como mercado urbano (`market.city = Bengaluru`); Exa recibe como `location` la ciudad de la consulta aunque la página no nombre lugar | `global-market-search.ts › cityForCountry`, `exa-events.ts › toEvidence` | `presentedAsCity: Bengaluru` con `trendBasis: country` y evidencia ubicada en «India»; evidencia Exa sin lugar → `location: Bengaluru` | Sin ciudad factual desde una señal nacional; lugar pendiente cuando la fuente no lo respalda | [03](../../../../.scratch/evaluacion-persistida/issues/03-geografia-con-alcance.md) |
| O3 | Eventos vencidos citados como «upcoming»; fecha ausente reemplazada por `new Date()` en el adaptador; recap de un evento pasado contado como listing vivo por su fecha de publicación reciente | `search-opportunities.ts` (razón Luma), `opportunity-adapter.ts › toEvents`, `exa-events.ts` | 3 de 3 oportunidades locales vencidas en el reloj y citadas como «upcoming»; `startsAt = 2026-09-07T22:28:00.000Z` para un evento sin fecha; recap del 12 Ago citado como listing vivo | 0 vencidas como futuras; `startsAt` pendiente (`null`); recap no citado como evento vigente | [04](../../../../.scratch/evaluacion-persistida/issues/04-vigencia-y-fechas-desconocidas.md) |
| O4 | Narrativa con cita inexistente se publica con las citas propias de la oportunidad sustituidas; cita ajena (evidencia de otra oportunidad) y cita real irrelevante se aceptan como soporte | `gemini.ts › applyDecision` | «80% of attendees…» publicada con los ids de Berlín; «96/100» de India publicada para San Francisco; «40+ meetups» publicada con un solo listing | Ninguna de las tres se publica como razón factual; se conserva la explicación determinística con advertencia | [05](../../../../.scratch/evaluacion-persistida/issues/05-explicaciones-con-soporte.md) |
| O5 | El modelo devuelve `rank` invertido y v0 reordena el array; el adaptador emite `rank: index + 1` sobre ese orden | `gemini.ts › reasonWithGemini` (sort por rank), `opportunity-adapter.ts` | Orden `berlin, san-francisco, bengaluru` frente al determinístico `bengaluru, san-francisco, berlin`; scores idénticos | Orden y rank iguales al determinístico con o sin modelo | [06](../../../../.scratch/evaluacion-persistida/issues/06-orden-solo-deterministico.md) |

## Cómo reproducir cada defecto

Todo parte de `import * as h from '../fixtures/baseline-v0/harness.ts'` y de `await h.loadV0()` (los módulos con alias `@/` solo cargan con import dinámico tras registrar el gancho).

**O1 — presupuesto.** Resolver con cache aislada; misma petición con `budgetUsd: 2000` y luego `20000`; después el par con `Promise.all`. Comparar `query.budgetUsd` y `requestId` de las respuestas.

```ts
const resolver = v0.resolve.createSearchResolver({ cache: new v0.cache.TtlCache(v0.cache.SIX_HOURS_MS) });
await h.withReplay({}, async () => {
  const a = await resolver({ ...h.BASELINE_REQUEST, budgetUsd: 2000 });
  const b = await resolver({ ...h.BASELINE_REQUEST, budgetUsd: 20000 }); // v0: b.query.budgetUsd === 2000
});
```

**O2 — geografía.** `h.runReplay()`; en `opp-global-bengaluru` mirar `market.city`, `momentumSignals[google_trends].basis` y `evidence[...].location`; buscar la evidencia con url `…/llm-monitoring-online` y su `location`.

**O3 — vigencia.** `h.runLocalPipeline()` sobre los seeds en el reloj congelado: filtrar oportunidades con `event.startsAt < evaluationClock` cuya razón diga «upcoming». Adaptador: `toLegacyShape` con un `event.startsAt: null` bajo `freezeClock()` devuelve `startsAt` igual al reloj. Exa: la evidencia con url `…/observability-day-india-recap` aparece citada en la razón «live developer event listings».

**O4 — soporte de citas.** `h.runReplay()` (Gemini grabado, adversarial): en `opp-global-berlin` la primera razón empieza con «80% of attendees…» y cita los ids propios; en `opp-global-san-francisco` la primera razón cita `ev-trends-…` de India; en `opp-global-bengaluru` la cifra «40+ meetups» cita un solo listing.

**O5 — orden.** Comparar `h.runReplay()` con `h.runReplay(h.BASELINE_REQUEST, { withGemini: false })`: ids en orden inverso, scores iguales; `toLegacyShape(replay).opportunities[i].rank` sigue al array recibido.

## Notas de caracterización

- En v0 la ruta HTTP (`searchOrFixture`) nunca llega al pipeline local sobre seeds: el ranking mundial siempre devuelve oportunidades (rellena ciudades preparadas) y ninguna etapa lanza. Los 136 seeds son material histórico; el loader solo carga los de SF.
- Cada repetición deja tres timers de 4,5 s (`LIVE_SIGNAL_WAIT_MS`) que no se pueden inyectar sin tocar `global-market-search.ts` (fuera del alcance de 01); el test tarda unos segundos por eso.
- Las caches por término de `global-market-search.ts` son globales del proceso: tras la primera repetición, las siguientes no vuelven a pedir Trends/GitHub/X. `failProviders` del harness solo actúa en un proceso fresco.
- `requestId` es el único campo no determinístico y se enmascara al comparar.
- Suite previa al ticket: 35 tests en verde, lint limpio, sin fallos preexistentes (ver `manifest.json › suiteBaseline`).
