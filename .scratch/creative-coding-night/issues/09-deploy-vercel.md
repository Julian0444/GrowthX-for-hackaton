# 09: Deploy a Vercel YA — sin claves

**What to build:** **Primero que todo, hoy**: la página vive en una URL limpia y pública (tipo `growthx-atlas.vercel.app`) corriendo **sin** env keys — decisión consciente: la demo usa fixtures deterministas (rápido, cero dependencia de terceros en vivo). Build de producción verde en local primero (se arregla lo que salga ANTES de tocar Vercel), después el proyecto sobre el directorio del frontend. Decisión post-review: el deploy no espera a ningún otro milestone — se deploya el estado actual y cada merge posterior redeploya solo por push, así el requisito duro "página deployada" queda banqueado desde el principio y nadie pelea con Vercel a las 2am.

Heredado del ticket 08 (cortado): **la página deployada no muestra el banner de modo degradado** — el warning de 3 líneas sobre GEMINI/Apify que aparece al correr sin keys mata la magia de la demo. Suprimirlo en el deploy de demo (query param o flag; el mecanismo de clase está en la sección M6 del plan).

**Blocked by:** None (can start immediately)

**Status:** claimed

- [ ] Build de producción verde en local antes de tocar Vercel
- [ ] Deploy sin env keys: la app corre con fixtures deterministas de punta a punta
- [ ] URL limpia y pública funcionando
- [ ] El banner de modo degradado no es visible en la página deployada
- [ ] Redeploy automático verificado: un push posterior actualiza la URL solo

Detalle: sección **M7 (puntos 1–2)** de la spec + mecanismo del banner en **M6**.

## Comments

- 2026-08-25: desbloqueado post-review (antes dependía de 02 y 03 por la "línea de corte" del plan — era un error: deployar temprano banca el requisito y elimina el riesgo de deploy de último minuto). Absorbe la supresión del banner degradado del ticket 08.
- 2026-08-25: en progreso. Build de producción local verde (`pnpm --dir frontend build`). Banner de modo degradado suprimido en `components/atlas/request-banner.tsx` (`if (process.env.NODE_ENV === "production") return null` sobre la rama `partial`; deja intacta la rama `error`) — verificado por inspección del bundle compilado (`req-banner partial` ausente en `.next/server` y `.next/static`, `req-banner error` sigue presente) y por request real a `/api/opportunities/search` sin keys (`degraded: true`, 3 oportunidades vía fixtures, fin a fin). Tests (`pnpm --dir frontend test`) 40/40 verdes.
  Bloqueado: ya existe un proyecto Vercel linkeado (`frontend/.vercel/project.json`, proyecto "growxth"), pero el token del CLI local expiró (`vercel whoami` → "specified token is not valid") y no hay señal de integración Git Vercel↔GitHub en este repo (sin deployments/check-runs en `Julian0444/GrowthX-for-hackaton`). Login es interactivo (browser/email) — necesito que el humano corra `vercel login` de nuevo antes de poder linkear/deployar/verificar el redeploy-on-push.
