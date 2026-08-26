# 08: Autopilot `?demo=1` — la página se demuestra sola

**What to build:** Con `?demo=1` en la URL, la página corre sola en loop de ~55s el guion completo: idle respirando → una query real se tipea sola a lo typewriter en el intake → búsqueda → analyzing → results → selección del #1 (con scroll suave del drawer) → campaign → selección del #2 → reset → loop. Es un secuenciador de timers sobre los callbacks que el shell ya expone (búsqueda, selección, campaign, reset) — no toca la máquina de estados; el único cambio de componente es una prop para inyectar texto externo en el campo del intake.

Reglas de robustez: cualquier interacción real del juez detiene el autopilot definitivamente (el juez toca = es suyo); un fallo de búsqueda se reintenta una vez a los 3s y si vuelve a fallar se salta a idle sin mostrar jamás el error; y en modo demo el banner de backend degradado (que hoy ocupa 3 líneas arriba del mapa y mata la magia) queda oculto.

**Blocked by:** None (can start immediately — usa callbacks existentes del shell). Aviso: toca el mismo efecto de URL params que el ticket 02; en paralelo habrá un merge menor.

**Status:** wontfix

- [ ] `?demo=1` corre el guion de ~55s en loop, con la query tipeada a lo typewriter
- [ ] Cualquier pointerdown real detiene el autopilot de forma definitiva
- [ ] Fallo de búsqueda: un retry a los 3s; si falla de nuevo, vuelve al loop desde idle sin error visible
- [ ] En modo demo no se muestra el banner de modo degradado
- [ ] 10 minutos corriendo en loop sin intervención ni errores visibles, contra el backend degradado (sin env keys)

Detalle de implementación (guion con timings): sección **M6** de la spec.

## Comments

- 2026-08-25: **wontfix** — decisión post-review: el formato del evento no justifica las 2.5h; la demo se maneja en vivo. Lo único imprescindible de este ticket (ocultar el banner de modo degradado en la página deployada) se movió al ticket 09. El resto de la sección M6 del plan queda sin efecto.
