# GrowXth — Plan de implementación (hackathon build)

**Objetivo:** capa de inteligencia que le dice a un equipo de growth de startup temprana **dónde en la comunidad dev de SF rinde más su próximo dólar de sponsorship, y con quién hablar** — con evidencia verificable, validación humana (Terac) y entrega accionable por mensaje (Linq).

**Tracks apuntados:** Linq · Terac · Most Creative.

---

## 0. Decisiones tomadas antes de escribir código

### X / Twitter → **fuera, definitivamente**

No es solo falta de tiempo: sus términos prohíben scraping sin consentimiento previo y la API oficial no aporta nada que Exa + GitHub + Terac no cubran mejor. Además, sacarlo **mejora el pitch**:

> "No scrapeamos personas. Preguntamos — con panel consentido, vía Terac."

Eso convierte una limitación en una postura de producto. Dilo en voz alta ante los jueces.

### Apify → **fuera esta noche, pero presente como interfaz**

Su único valor real era descubrir eventos de Luma en bulk. Para un MVP **solo-SF con ~15–20 eventos**, curar a mano + tu importador de URL de Luma (que ya funciona) es más rápido y más confiable que pelearte con un actor, validar campos, y pagar latencia/costo.

Pero el pitch promete "ingesta swappable". Se resuelve con arquitectura, no con horas:

```ts
// lib/server/connectors/events/index.ts
export interface EventSource {
  id: 'luma-url' | 'apify-luma' | 'seed';
  discover(params: DiscoverParams): Promise<RawEvent[]>;
}
```

Implementas `luma-url` y `seed`. Dejas `apify-luma.ts` como stub documentado que lanza `NotImplementedError`. Puedes decir con honestidad "las fuentes son intercambiables, hoy corremos dos de tres" — que es exactamente el tipo de honestidad que ya define tu producto.

### Alcance geográfico → **solo San Francisco**

"Seis ciudades semilla" era tu claim más débil. "Mapeamos SF de verdad" es defendible y demostrable hoy. El pitch global (SF vs Bangalore vs São Paulo) queda como la diapositiva de "después de la hackathon".

---

## 1. Arquitectura por capas

| Capa | Responsabilidad | Implementación hoy |
|---|---|---|
| **L0 Grafo** | Events ↔ Communities ↔ Organizers | `data/seed/*.json` + loader en memoria |
| **L1 Discovery** | Candidatos y señal fresca | Exa (live) · Luma (import) · GitHub (batch) |
| **L2 Evidencia** | Normalizar, dedupe, confianza, rights basis | `normalize/evidence.ts` |
| **L3 Ground truth** | ¿A esta audiencia le importa? | **Terac** |
| **L4 Scoring** | Rankear + generar razones explicables | `scoring/opportunity-score.ts` (determinista) |
| **L5 Entrega** | Llevar la respuesta al humano y dejarlo actuar | **Linq** (iMessage/RCS) |
| **L6 Medición** | Actuals post-evento de vuelta al grafo | Linq (reporte) + Terac (post-event) |

**Regla dura:** el LLM puede ayudar a *interpretar la consulta* y a *redactar*, nunca a rankear. El ranking es determinista y testeable.

---

## 2. Estructura de archivos objetivo

```
interactive-world-map/
  CLAUDE.md                              # invariantes del proyecto (ver archivo aparte)
  app/api/
    opportunities/search/route.ts        # L4 — búsqueda live
    linq/webhook/route.ts                # L5 — mensaje entrante
    og/opportunity/route.tsx             # imagen del ranking (next/og)
    events/ingest/route.ts               # ya existe
  lib/
    contracts/growxth.ts                 # ÚNICA fuente de verdad de tipos
    client/atlas-client.ts               # live-first + fallback
    server/
      graph/load-graph.ts
      connectors/
        exa.ts
        github.ts
        terac.ts
        linq.ts
        events/{index,luma-url,apify-luma,seed}.ts
      normalize/{evidence,location}.ts
      scoring/{opportunity-score,roi}.ts
      pipeline/search-opportunities.ts
      format/{sms-reply,reasons}.ts
      cache/search-cache.ts
      demo/fixtures.ts
  data/seed/
    sf-events.json
    sf-communities.json
    sf-organizers.json
    terac-study.json
  tests/{contracts,scoring,format}/
```

### Variables de entorno

```
EXA_API_KEY
GITHUB_TOKEN
TERAC_API_KEY            # si el sponsor te da acceso; si no, modo seed
LINQ_API_KEY
LINQ_WEBHOOK_SECRET
ANTHROPIC_API_KEY        # solo para interpretar la consulta entrante
NEXT_PUBLIC_BASE_URL
```

Ninguna se expone al cliente. `NEXT_PUBLIC_` solo para la base URL.

---

## 3. Contratos (escribir esto PRIMERO)

Los agentes de código trabajan muchísimo mejor con los tipos definidos antes que la lógica. Este archivo es el que le pasas como contexto en cada sesión.

```ts
// lib/contracts/growxth.ts

// ---------- L0: grafo ----------
export type EntityKind = 'event' | 'community' | 'organizer';
export type Status = 'observed' | 'estimated' | 'prepared';

export interface SFEvent {
  id: string;
  name: string;
  url: string;
  startsAt: string | null;          // ISO
  venueArea: string | null;         // "SoMa", "Mission", "FiDi"
  lat: number;
  lng: number;
  expectedAttendance: number | null;
  attendanceBasis: Status;
  stack: string[];                  // ["python", "ai-agents", "infra"]
  communityIds: string[];
  organizerIds: string[];
  sponsorTiers: { name: string; priceUsd: number | null }[];
  knownSponsors: string[];
  evidenceIds: string[];
}

export interface Community {
  id: string;
  name: string;
  url: string;
  kind: 'discord' | 'meetup-series' | 'university' | 'org' | 'slack';
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'irregular' | null;
  sizeEstimate: number | null;
  sizeBasis: Status;
  stack: string[];
  organizerIds: string[];
  evidenceIds: string[];
}

// SOLO roles públicos de organizador. Nunca perfiles de devs individuales.
export interface Organizer {
  id: string;
  displayName: string;
  publicRole: string;               // "Organizer, JacHacks SF"
  publicContactUrl: string | null;  // Luma host page, sitio del evento
  organizesEventIds: string[];
  communityIds: string[];
  evidenceIds: string[];
}

// ---------- L2: evidencia ----------
export type EvidenceSource = 'exa' | 'luma' | 'github' | 'terac' | 'seed';
export type EvidenceKind =
  | 'web_page' | 'event_listing' | 'repo_activity'
  | 'human_interview' | 'prepared_fixture';
export type RightsBasis =
  | 'public_web' | 'public_api' | 'consented_panel' | 'manual_curation';

export interface Evidence {
  id: string;
  source: EvidenceSource;
  kind: EvidenceKind;
  url: string | null;
  title: string;
  observedAt: string;               // ISO
  location: string | null;
  confidence: number;               // 0-1
  rightsBasis: RightsBasis;
  status: Status;
  excerpt?: string;                 // máx ~200 chars, nunca párrafos completos
}

// ---------- L4: request / response ----------
export interface SearchRequest {
  product: string;
  icpStack: string[];
  budgetUsd: number;
  goal: 'adoption' | 'feedback' | 'hiring' | 'awareness';
}

export interface ScoreBreakdown {
  icpFit: number;          // peso 0.30
  reachQuality: number;    // peso 0.20
  access: number;          // peso 0.15
  saturationGap: number;   // peso 0.15
  costEfficiency: number;  // peso 0.10
  confidence: number;      // peso 0.10
}

export interface Reason {
  text: string;
  evidenceIds: string[];   // NUNCA vacío
}

export interface RoiEstimate {
  tierPriceUsd: number | null;
  expectedAttendance: number | null;
  icpFitRate: number | null;                       // 0-1
  icpFitBasis: 'terac' | 'github' | 'prepared' | null;
  costPerQualifiedDev: number | null;
  band: [number, number] | null;
  note: string | null;                             // "No disponible" si falta input
}

export interface Opportunity {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  score: number;                    // 0-100
  breakdown: ScoreBreakdown;
  reasons: Reason[];
  roi: RoiEstimate;
  confidence: number;
  status: Status;
  humanValidated: boolean;          // true solo con evidencia Terac
}

export interface Coverage {
  eventsEvaluated: number;
  communitiesEvaluated: number;
  organizersEvaluated: number;
  sourcesUsed: EvidenceSource[];
  sourcesFailed: EvidenceSource[];
}

export interface SearchResponse {
  requestId: string;
  query: SearchRequest;
  opportunities: Opportunity[];              // top 3
  evidence: Record<string, Evidence>;        // resuelto por id
  coverage: Coverage;
  warnings: string[];
  generatedAt: string;
  degraded: boolean;
}
```

---

## 4. Scoring y ROI

### Pesos

```
icpFit          0.30   overlap de stack (GitHub + seed) × fit rate de Terac
reachQuality    0.20   asistencia esperada × densidad técnica, log-normalizado
access          0.15   ¿hay contacto público? ¿queda lead time? ¿hay tier disponible?
saturationGap   0.15   1 − (sponsors competidores / max observado)
costEfficiency  0.10   invertido y normalizado sobre costPerQualifiedDev
confidence      0.10   cobertura × frescura × concordancia entre fuentes
```

`opportunity-score.ts` debe ser **una función pura sin I/O**. Entra `{ entity, evidence[], request }`, sale `{ score, breakdown, reasons }`. Eso la hace trivial de testear y de defender ante un juez que pregunte "¿por qué este número?".

### La fórmula que va en pantalla

```
costPerQualifiedDev = tierPriceUsd / (expectedAttendance × icpFitRate)
```

- `icpFitRate` viene de Terac (preferido) o de composición de GitHub (fallback).
- Si falta cualquier input → `costPerQualifiedDev = null` y `note = "No disponible"`. **Nunca inventes el número.** Excluirlo del score es mejor que fabricarlo; esa disciplina es literalmente tu diferenciador.
- Muestra siempre la banda, no un puntito: `$28–$44 por dev calificado`.

---

## 5. Integración de sponsors

### Terac — L3 (input, confianza)

```ts
// lib/server/connectors/terac.ts
export interface TeracStudy {
  id: string;
  question: string;
  n: number;
  themes: { label: string; share: number; verbatimIds: string[] }[];
  verbatims: { id: string; text: string; segment: string }[];
  completedAt: string;
}

export async function getStudy(id: string): Promise<TeracStudy>;
export async function runStudy(question: string, n: number): Promise<{ id: string }>;
```

**Qué corres:** un estudio con devs de SF que asistieron a un hackathon en los últimos 6 meses. Pregunta base: *cómo lo encontraron, si interactuaron con sponsors, qué los hizo probar una herramienta.* Con 12–15 entrevistas alcanza.

**Qué te da:**
1. `icpFitRate` real → el denominador de tu ROI deja de ser una suposición.
2. El *porqué* → verbatims citables en las razones del ranking.
3. Una clase de evidencia nueva: `kind: 'human_interview'`, `rightsBasis: 'consented_panel'`, confianza tope.

**El beat de demo (8 segundos):** la oportunidad #1 muestra badge **Estimated**. Presionas "Validate with humans". Entra la evidencia Terac, el badge pasa a **Observed**, `humanValidated: true`, y el score se mueve en pantalla.

**Modo sin API:** pre-corres el estudio, guardas el JSON en `data/seed/terac-study.json`, y el botón lo carga desde ahí con badge honesto. Funciona igual en demo.

### Linq — L5/L6 (output, acción)

```
POST /api/linq/webhook
  → verificar firma (LINQ_WEBHOOK_SECRET)
  → parsear texto entrante → SearchRequest
  → searchOpportunities(request)   // MISMO pipeline que la UI
  → formatSmsReply(response)       // ≤ 3 opciones, ≤ 500 chars, 1 link por opción
  → enviar respuesta + imagen del ranking vía Linq API
```

**Imagen del ranking:** no hagas screenshot con headless browser, es una trampa de tiempo. Usa `next/og` (`ImageResponse`, viene incluido en Next). Ruta `app/api/og/opportunity/route.tsx` que renderiza una card con las 3 opciones, el score y el costo por dev. Pasas esa URL como media en el mensaje.

**Quick replies a soportar:** `evidencia` / `email` (borrador para el organizador) / `por qué no <ciudad|evento>`.

**Radar proactivo (si sobra tiempo):** evento nuevo en el grafo que matchea el ICP → mensaje sin que lo pidan. Es el argumento de por qué esto vive en mensajería y no en un dashboard.

**Guardarraíl no negociable:** solo se le manda mensajes al dueño de la cuenta que optó in. GrowXth **redacta** el email al organizador; el humano lo manda. Nada de cold-texting a organizadores ni a devs.

---

## 6. Tareas (ejecutables una por una con Claude Code / Codex)

Cada tarea es un commit. No arranques la siguiente sin que pase el criterio de aceptación.

| # | Tarea | Tiempo | Depende de |
|---|---|---|---|
| T0 | Contratos + `CLAUDE.md` | 15 min | — |
| T1 | Seed SF + loader + validador | 45 min | T0 |
| T2 | Pipeline: Exa + scoring + route | 60 min | T1 |
| T3 | Frontend live-first, matar `DemoCity` | 30 min | T2 |
| T4 | Linq webhook + formatter + og image | 45 min | T2 |
| T5 | Terac: evidencia + badge flip | 30 min | T2 |
| T6 | Fallback, labels honestos, demo run | 30 min | todas |

**Total ≈ 4h. Si te quedan 2h:** T0 → T1 → T2 (scoring solo sobre seed, sin Exa) → T4. El track de Linq es el que da premio y el que se ve.

---

### T0 — Contratos

```
Crea lib/contracts/growxth.ts con exactamente los tipos del plan (sección 3).
Solo tipos e interfaces: cero lógica, cero imports de runtime.
Después crea CLAUDE.md en la raíz con las invariantes del proyecto.

Aceptación: pnpm tsc --noEmit pasa. Ningún otro archivo modificado.
```

### T1 — Seed SF

```
Contexto: lib/contracts/growxth.ts

1. Crea data/seed/sf-events.json con 15-20 eventos REALES de la comunidad
   dev de SF (hackathons, meetups recurrentes, conferencias). Cada uno con
   nombre real, URL real, y lat/lng reales. Marca attendanceBasis:
   'prepared' donde el número sea curado a mano.
2. Crea data/seed/sf-communities.json con 12-15 comunidades.
3. Crea data/seed/sf-organizers.json con ~15 organizadores.
   SOLO rol público y contacto público. Nada de perfiles individuales.
4. Crea lib/server/graph/load-graph.ts: carga los tres archivos, resuelve
   las referencias por id, expone getGraph() cacheado en memoria.
5. Crea scripts/seed-check.ts: valida contra los tipos, detecta ids
   colgantes y URLs duplicadas.

Aceptación: pnpm tsx scripts/seed-check.ts sale con código 0 y reporta
los conteos por tipo de entidad.
```

> ⚠️ Los datos semilla los llenas tú, no el agente. Un agente inventará eventos plausibles pero falsos, y eso destruye exactamente la credibilidad que este producto vende. Pídele el esqueleto y los tipos; los nombres y URLs los pegas a mano desde Luma.

### T2 — Pipeline y ruta

```
Contexto: lib/contracts/growxth.ts, lib/server/graph/load-graph.ts

1. lib/server/connectors/exa.ts: cliente con timeout de 4s y 3 queries en
   paralelo (demanda, eventos/comunidades, competencia). Devuelve Evidence[].
   Si falla, devuelve [] y un warning — nunca lanza.
2. lib/server/normalize/evidence.ts: URL canónica, dedupe por hash de URL,
   asigna confidence y status.
3. lib/server/scoring/opportunity-score.ts: FUNCIÓN PURA, sin I/O.
   Pesos de la sección 4. Devuelve { score, breakdown, reasons }.
   Cada reason lleva evidenceIds no vacío.
4. lib/server/scoring/roi.ts: costPerQualifiedDev con banda. Devuelve null
   + note cuando falte cualquier input. Nunca estima el precio del tier.
5. lib/server/pipeline/search-opportunities.ts: orquesta grafo + exa +
   scoring, presupuesto total de 8s, degradación parcial con warnings.
6. app/api/opportunities/search/route.ts: valida el body, llama al pipeline,
   devuelve SearchResponse.
7. tests/scoring/: al menos 6 tests de la función pura, incluyendo el caso
   de ROI faltante y el de evidencia vacía.

Aceptación: curl POST a /api/opportunities/search devuelve 3 oportunidades
con evidence resuelta y coverage real. Los tests pasan.
```

### T3 — Frontend live-first

```
Contexto: lib/contracts/growxth.ts

1. lib/client/atlas-client.ts: searchOpportunities() llama a la ruta real
   primero; si falla o hace timeout, cae al demo adapter y marca degraded.
2. Elimina el acoplamiento a DemoCity en la ruta principal. Drawer, campaña
   y signal cloud reciben Opportunity, no DemoCity. selectedCityId: string.
3. El drawer resuelve evidenceIds contra response.evidence y muestra
   link + fecha + badge de status por cada razón.

No rediseñes nada. Solo cambia de dónde vienen los datos.

Aceptación: los 3 resultados abren sin tocar DemoCity. Cada razón tiene
al menos un link clickeable. Sin errores de consola.
```

### T4 — Linq

```
Contexto: lib/contracts/growxth.ts, docs de Linq (docs.linqapp.com)

1. lib/server/connectors/linq.ts: sendMessage(to, text, mediaUrl?).
2. app/api/linq/webhook/route.ts: verifica firma con LINQ_WEBHOOK_SECRET,
   parsea el texto entrante a SearchRequest (una llamada corta a Claude con
   salida JSON estricta; fallback a parser por keywords si no hay key),
   corre searchOpportunities, responde.
3. lib/server/format/sms-reply.ts: máximo 3 opciones, ~500 chars, un link
   por opción, incluye costPerQualifiedDev o "No disponible".
4. app/api/og/opportunity/route.tsx: ImageResponse de next/og con la card
   del ranking. NO uses headless browser.
5. Quick replies: "evidencia", "email", "por qué no X".

Guardarraíl: solo se responde al número que escribió. Nunca se inicia
conversación con terceros. Escribe esto como comentario en el route.

Aceptación: mandar un SMS/iMessage al número de sandbox devuelve 3
oportunidades con la imagen adjunta en menos de 10s.
```

### T5 — Terac

```
Contexto: lib/contracts/growxth.ts

1. lib/server/connectors/terac.ts con la interfaz de la sección 5.
   Si no hay TERAC_API_KEY, lee data/seed/terac-study.json.
2. Mapea el estudio a Evidence[] con kind 'human_interview',
   rightsBasis 'consented_panel', confidence 0.9.
3. El pipeline acepta un flag includeHumanValidation. Cuando está activo,
   icpFitRate viene de Terac (icpFitBasis: 'terac') en vez de GitHub, y
   humanValidated pasa a true.
4. UI: botón "Validate with humans" en la oportunidad #1. Al resolver,
   el badge pasa de Estimated a Observed y el score se re-renderiza
   con transición visible.

Aceptación: el badge cambia y el score se mueve en pantalla, con los
verbatims de Terac visibles como evidencia enlazada en el drawer.
```

### T6 — Honestidad y demo

```
1. Auditá todos los labels: "Live signals" → "Prepared data" donde
   corresponda. Badge Observed SOLO con URL + fecha verificables.
2. La UI dice cuántos eventos/comunidades/organizadores evaluó.
   Nunca "cobertura global".
3. Guard de env vars: si falta una key, warning en el response, no crash.
4. Cache en memoria: hash de (product + icpStack + budget + goal), TTL 6h.
5. pnpm lint && pnpm build limpios. Corré la demo completa 3 veces,
   una de ellas con las API keys borradas a propósito.
```

---

## 7. Cómo trabajar con el agente

- **`CLAUDE.md` en la raíz.** Es lo que evita que el agente derive entre sesiones. Ver archivo aparte.
- **Una tarea, una sesión, un commit.** Sesiones largas acumulan contexto malo y el agente empieza a "arreglar" cosas que ya funcionaban.
- **Pasale `lib/contracts/growxth.ts` como contexto en cada tarea.** Es el ancla.
- **Pedí tests solo del scoring.** Es lo único donde el test paga en una hackathon: es puro, es lo que un juez cuestiona, y romperlo es silencioso.
- **Nunca dejes que invente datos.** Si un archivo semilla necesita contenido real, lo pegás vos. Regla explícita en `CLAUDE.md`.
- **Antes de cada commit:** `pnpm tsc --noEmit && pnpm lint`.

---

## 8. Checklist de aceptación final

- [ ] Una consulta arbitraria devuelve 3 oportunidades de SF en ≤ 8s
- [ ] Cada razón tiene fuente clickeable, fecha, tipo y confianza
- [ ] Ninguna oportunidad muestra un ROI inventado; lo faltante dice "No disponible"
- [ ] El badge Terac cambia en vivo y mueve el score
- [ ] Un mensaje entrante por Linq devuelve las 3 opciones con imagen
- [ ] La demo corre completa con las API keys borradas
- [ ] La UI declara cuántas entidades evaluó, sin afirmar cobertura global
- [ ] `pnpm lint && pnpm build` limpios, sin errores de consola

---

## 9. Guion de demo (75s)

| Tiempo | Acción | Mensaje |
|---|---|---|
| 0–15s | Un juez le manda un mensaje al número de GrowXth | "Los equipos de growth no saben dónde rinde su próximo dólar." |
| 15–35s | Llegan 3 opciones de SF con la imagen del ranking | "Mapeamos eventos, comunidades y quién los organiza." |
| 35–55s | Abrís #1 en la web y recorrés la evidencia | "Cada señal tiene fuente, fecha y confianza." |
| 55–70s | Presionás "Validate with humans" — el badge cambia | "Y cuando necesitamos saber si les importa, preguntamos. Panel consentido, vía Terac." |
| 70–75s | Cerrás con el costo por dev calificado | "Hoy elegimos mejor. Mañana medimos activación y retención." |

**Cierre:** *No scrapeamos personas. No inventamos ROI. Cuando no sabemos, lo decimos — y esa es exactamente la razón por la que un equipo de growth nos creería.*
