# 05: Coreografía por estado (recortada post-review)

**What to build:** Tres detalles que hacen que nada aparezca "de golpe" y la página nunca esté muerta:

1. **Reveal escalonado de markers**: los markers de oportunidad entran uno a uno por rank (~180ms entre cada uno) con una onda expansiva al aterrizar; el rank 1 con radio doble y en el acento de selección.
2. **Analyzing dramático**: durante el análisis, los pulsos de eventos vivos se aceleran — el mundo "se agita" mientras se lo interroga. Costo: una regla CSS.
3. **Idle ken-burns**: tras 5s sin interacción en idle, la cámara deriva lentísimo (drift sinusoidal, período ~40s); cualquier pointerdown lo cancela. Con el autopilot cortado (ticket 08), esto es lo único que mantiene la página "viva" en la mesa de demos.

**Recortados por decisión post-review** (buenas ideas, no ganan la demo esta noche): count-up de score, constelación del cluster seleccionado, tinte cian del scan.

**Blocked by:** 03 (Capa de 136 eventos reales pulsando — la agitación de analyzing acelera sus pulsos)

**Status:** ready-for-agent

- [ ] Markers entran escalonados por rank con onda expansiva; rank 1 con radio doble y acento
- [ ] En analyzing los pulsos de eventos se aceleran visiblemente
- [ ] Ken-burns en idle tras 5s, cancelado por cualquier interacción
- [ ] Una grabación de 20s del flujo completo se ve "dirigida" (nada aparece de golpe)
- [ ] Con `prefers-reduced-motion` todo sigue funcional y estático

Detalle de implementación: sección **M4** de la spec (solo los puntos 1, 2 y 5; los puntos 3 y 4 quedaron sin efecto).
