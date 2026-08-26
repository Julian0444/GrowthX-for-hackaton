# Spec — Creative Coding Night

La spec completa de este esfuerzo es el plan en la raíz del repo: `PLAN_CREATIVE_CODING_NIGHT.md`.
Cada ticket referencia la sección (M1–M7) del plan que detalla su implementación.
**Ojo:** las decisiones post-review de abajo tienen precedencia sobre el plan — las secciones
M1 (tema night) y M6 (autopilot, salvo la supresión del banner) quedaron sin efecto.

Objetivo: top 3 en un evento que premia belleza visual e interactividad (a16z · QuiverAI · Cursor).
Requisitos duros: usar Quiver AI + Cursor, página deployada. Sin tocar backend/scraping.

## Grafo de tickets (actualizado 2026-08-25, post-review)

| # | Ticket | Bloqueado por | Estado |
|---|--------|---------------|--------|
| 01 | Prefactor: tokenizar colores | — | **wontfix** (cayó con el tema night) |
| 02 | Tema "Atlas Night" | 01 | **wontfix** (la demo queda en paper) |
| 03 | Capa de 136 eventos reales pulsando | — | **resolved** (2026-08-25; posición = centroide real + offset ×110, ver ticket) |
| 04 | Arcos animados con cometas (results) | — | claimed (en curso) |
| 05 | Coreografía por estado (recortada) | 03 | ready-for-agent |
| 06 | Autorizar OAuth de Quiver MCP (humano) | — | **resolved** (2026-08-25; e2e ok, arrow-2 = 0 créditos, ver ticket) |
| 07 | Asset Quiver hero (+ stretch) | 06 | **resolved** (2026-08-25; emblema hero en intake con draw-in; monograma GX versionado sin integrar, ver ticket) |
| 08 | Autopilot `?demo=1` | — | **wontfix** (banner → 09) |
| 09 | Deploy a Vercel YA, sin claves | — | claimed (proyecto Vercel ya linkeado) |
| 10 | QA de venue, video y pitch (humano) | 09 | ready-for-human |

**Frontier inmediato: 09 primero (hoy), y en paralelo 03, 04 y 06.** Después: 05 (tras 03),
07 (tras 06), 10 al final sobre el último redeploy.

**Línea de corte mínima presentable** = 09 (deployado) + 03 (eventos pulsando) + 07 (asset
Quiver hero, requisito del evento).

## Decisiones post-review (2026-08-25)

Review externo aceptado con matices; verificación propia donde correspondía:

1. **Deploy primero, no último**: 09 desbloqueado — se deploya el estado actual hoy y cada
   push redeploya. Banca el requisito duro y elimina el riesgo de Vercel a última hora.
2. **Tema night cortado**: la estética paper actual ya es premium y destaca entre proyectos
   oscuros con neón; los proyectores con luz ambiente lavan los oscuros. Caen 01 y 02;
   03 y 04 quedan desbloqueados y usan la paleta actual (pulsos = ondas de tinta, no neón).
3. **Copy honesto**: **verificado contra los JSON** — 103 de los 136 eventos ya ocurrieron
   (rango 24-jul → 5-nov). El chip dice "136 events ingested from Luma · SF + NYC", nunca
   "live". Se mantienen los 136 en el mapa (filtrar a los 33 futuros arruinaría el visual).
4. **Quiver: prioridad de requisito, hero-first**: 07 re-scopeado a UN asset grande visible
   en la primera pantalla; glifos stretch; OG image cortada.
5. **Autopilot cortado** (08 wontfix): la demo se maneja en vivo. La supresión del banner de
   modo degradado — imprescindible — se movió al 09. El video de respaldo (10) se graba a mano.
6. **Micro-detalles recortados** (05): quedan reveal escalonado, agitación en analyzing y
   ken-burns idle; caen count-up, constelación y tinte del scan. Se mantienen los labels de
   los ~34 heroes a zoom profundo (beat barato y fuerte; el review los sobreestimó como "136").

Regla transversal (del plan §0, sigue vigente): toda geometría nueva debe ser determinista
(nada de `Math.random()`/`Date.now()` en render) o rompe hydration. Un commit por sub-etapa
con la app funcionando.
