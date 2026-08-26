# 01: Prefactor — tokenizar colores hardcodeados

**What to build:** La app se ve pixel-idéntica a hoy, pero ningún color del atlas queda hardcodeado: todos los `#111`, `#fff` y `rgba(17,17,17,…)` del path del atlas pasan por tokens CSS. Se introducen ~8 tokens nuevos (`--signal-ink`, `--on-ink`, `--surface-raised`, `--scan-tint`, `--status-ok/warn/err`, `--ambient-dim`) definidos con los valores visuales actuales. Esto hace trivial el re-tema del ticket 02: cambiar tema = redefinir tokens, nada más. La zona "arena" queda fuera de alcance (no se tematiza).

**Blocked by:** None (can start immediately)

**Status:** wontfix

- [ ] Cero literales `#111`/`#fff`/`rgba(17,17,17,…)` restantes en el path del atlas (componentes TSX y bloque CSS del atlas), según la auditoría de la sección M1/1a de la spec
- [ ] Tokens nuevos definidos en el scope actual con los valores de hoy — el resultado es pixel-idéntico en los 5 estados de vista, drawer, campaign y popover de capas
- [ ] El gradiente de halo del mapa queda parametrizado o duplicado para poder tematizarse después
- [ ] Commit aislado, ANTES de cualquier cambio de paleta (si algo se rompe luego, bisect trivial)

Detalle de implementación: sección **M1 / 1a** de la spec.

## Comments

- 2026-08-25: **wontfix** — el tema Night se cortó tras el review externo (la demo queda en paper). Este prefactor solo tenía sentido como habilitador del re-tema; sin el 02 es costo sin payoff para la noche. Si un agente lo estaba trabajando (estaba `claimed`), abandonar. Si la tokenización ya aterrizó en algún commit, es inocua (pixel-idéntica por definición): no revertir.
