# 07: Asset Quiver hero (+ extras solo si sobra tiempo)

**What to build:** El requisito del evento "usó Quiver AI" queda cumplido con **UN asset grande e inconfundible**: el emblema de constelación sobre el título del intake — la primera pantalla que ve el juez — entrando con stroke draw-in secuencial. Post-proceso obligatorio: fills/strokes a `currentColor`, sin width/height fijos (solo `viewBox`), integrado a la paleta paper. Decisión post-review: un asset grande y visible a 3 metros vale más que cuatro glifos diminutos que el juez jamás ve.

**Stretch, solo si sobra tiempo** (en este orden): monograma GX para header/favicon; glifos de evento/comunidad/empresa para el zoom profundo. **Cortado**: OG image personalizada (nadie la ve en el venue).

**Fallback explícito (no bloquea nada):** si Quiver falla o va lento, el requisito se cubre con cualquier asset generado + mencionarlo en la demo.

**Blocked by:** 06 (Autorizar OAuth de Quiver MCP)

**Status:** ready-for-agent

- [ ] Emblema hero generado con Quiver, visible en la primera pantalla del intake, con stroke draw-in
- [ ] Post-proceso aplicado: `currentColor`, solo `viewBox`, legible en la paleta actual
- [ ] Carpeta de assets versionada en el repo
- [ ] Una línea en el README de qué se generó con Quiver (los sponsors-jueces lo van a preguntar)
- [ ] (stretch) Monograma GX y/o glifos, solo si el resto del frontier está resuelto

Detalle de implementación (pipeline + prompts): sección **M5** de la spec (ignorar OG image).

## Comments

- 2026-08-25: re-scopeado post-review — de "≥4 assets" a "1 asset hero obligatorio + resto stretch"; OG cortada.
