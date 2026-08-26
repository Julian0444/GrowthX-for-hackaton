# 07: Asset Quiver hero (+ extras solo si sobra tiempo)

**What to build:** El requisito del evento "usó Quiver AI" queda cumplido con **UN asset grande e inconfundible**: el emblema de constelación sobre el título del intake — la primera pantalla que ve el juez — entrando con stroke draw-in secuencial. Post-proceso obligatorio: fills/strokes a `currentColor`, sin width/height fijos (solo `viewBox`), integrado a la paleta paper. Decisión post-review: un asset grande y visible a 3 metros vale más que cuatro glifos diminutos que el juez jamás ve.

**Stretch, solo si sobra tiempo** (en este orden): monograma GX para header/favicon; glifos de evento/comunidad/empresa para el zoom profundo. **Cortado**: OG image personalizada (nadie la ve en el venue).

**Fallback explícito (no bloquea nada):** si Quiver falla o va lento, el requisito se cubre con cualquier asset generado + mencionarlo en la demo.

**Blocked by:** 06 (Autorizar OAuth de Quiver MCP)

**Status:** resolved

- [x] Emblema hero generado con Quiver, visible en la primera pantalla del intake, con stroke draw-in
- [x] Post-proceso aplicado: `currentColor`, solo `viewBox`, legible en la paleta actual
- [x] Carpeta de assets versionada en el repo
- [x] Una línea en el README de qué se generó con Quiver (los sponsors-jueces lo van a preguntar)
- [ ] (stretch) Monograma GX y/o glifos, solo si el resto del frontier está resuelto — parcial: monograma generado y versionado, sin integrar (ver Answer)

Detalle de implementación (pipeline + prompts): sección **M5** de la spec (ignorar OG image).

## Answer

Cerrado el 2026-08-25 (noche), verificando cada criterio en navegador sobre `next dev`:

- **Asset hero**: la constelación circular line-art generada con Quiver (Arrow 2.0) en la prueba e2e del 06 (creation `01a03c04-ac3d-7e20-9057-176bff018b97`). Crudo post-procesado versionado en `frontend/public/quiver/constellation-emblem.svg`; inline como `frontend/components/quiver/constellation-emblem.tsx` — 45 trazos (aro + 24 rutas + 20 nodos, 3 hubs `qe-hero`) con `pathLength={1}`.
- **Draw-in verificado**: coreografía aro (1150 ms) → rutas (stagger 45 ms) → nodos (stagger 40 ms), ~2.2 s total; delays derivados del índice — deterministas, sin `Math.random()`/`Date.now()` (regla §0). Evidencia: captura a mitad de animación (aro completo, rutas trazándose) y `svg.getAnimations()` = 45/45 `atlas-emblem-draw` en estado `finished`. Con `prefers-reduced-motion` aparece ya dibujado (`animation: none` en el bloque del emblema).
- **Post-proceso**: strokes a `currentColor` (hereda `--ink` de la paleta paper), sin `width`/`height` (solo `viewBox`), rect de fondo del modelo eliminado; jerarquía de tinta por opacidad (aro 0.4 / rutas 0.72 / nodos 1). Legible y protagonista en la card del intake (148 px).
- **README**: creado en la raíz con sección "Made with Quiver AI" (emblema + monograma, modelo y pipeline MCP).
- **Stretch parcial**: monograma GX generado con la re-verificación e2e del 06 (creation `01a03c0c-819e-76cc-bbc9-61e38c7198ba`, 0 créditos) y versionado en `frontend/public/quiver/gx-monogram.svg`; **no** integrado a header/favicon porque la condición del stretch (frontier resuelto) no se da — 04 y 09 siguen abiertos. Glifos: no se generaron.
- Chequeo de intake limpio: carga fresca sin errores de consola ni overlay de Next. (El "1 Issue" que aparece tras correr una búsqueda viene del flujo results/arcos en WIP de otros tickets, no del emblema.)

Nota de proceso: dos sesiones de agente trabajaron este ticket en simultáneo (~20:12–20:15) y una pisó el componente de la otra; se reconcilió reconstruyendo `constellation-emblem.tsx` al contrato del CSS ya integrado (`.qe`/`.qe-rim`/`.qe-link`/`.qe-node`/`.qe-hero`, delay por `--ed`) y se re-verificó todo de punta a punta. Evitar doble asignación de tickets entre sesiones.

## Comments

- 2026-08-25: re-scopeado post-review — de "≥4 assets" a "1 asset hero obligatorio + resto stretch"; OG cortada.
- 2026-08-25 (noche): resuelto — emblema hero visible en la primera pantalla con draw-in verificado en navegador; monograma GX versionado como bonus sin integrar.
