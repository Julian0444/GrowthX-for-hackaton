# 04: Arcos animados con cometas (results)

**What to build:** Cuando llegan los resultados de una búsqueda, la revelación se corea: la cámara vuela, y entonces arcos de tinta se dibujan escalonados (uno cada ~240ms, por rank) desde el origen del usuario — su ubicación si existe, si no SF — hacia cada ciudad resultado; al completarse cada arco, un cometa lo recorre en loop. Al seleccionar una ciudad, su arco sube al color de acento/selección existente de la paleta y los demás bajan a opacidad 0.15: el foco se re-enfoca hacia lo elegido. Todo vive solo en los estados results/selected/campaign.

Decisiones de la spec: path = bézier cuadrática en espacio canvas (indistinguible del gran círculo a esta escala, 10× más simple), determinista y redondeada; cometas con SMIL `animateMotion` (cero JS por frame); draw-in con `stroke-dasharray` medido una sola vez por set de resultados; trazo con `vector-effect: non-scaling-stroke` para que el grosor no explote con zoom.

**Blocked by:** None (can start immediately — desbloqueado al cortarse el ticket 01; usa la paleta actual)

**Status:** claimed

- [ ] Secuencia búsqueda→revelado coreografiada: vuelo de cámara → arcos dibujándose escalonados → cometas arrancando al terminar su arco
- [ ] Origen correcto: ubicación del usuario si existe, fallback SF
- [ ] Al seleccionar: arco del seleccionado en el acento de selección existente, el resto a opacidad 0.15, solo con CSS por estado
- [ ] Grosor de trazo estable a cualquier zoom
- [ ] Geometría determinista (sin hydration mismatch); cero re-renders de React durante vuelos (verificado con React DevTools profiler)

Detalle de implementación: sección **M3** de la spec.
