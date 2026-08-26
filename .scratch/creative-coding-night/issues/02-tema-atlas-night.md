# 02: Tema "Atlas Night" + switch sol/luna

**What to build:** Al abrir la página, el atlas se ve en modo nocturno por defecto: océano azul-negro espacio profundo, tierra apenas más clara, toda señal/dato en luz cian, y ámbar reservado exclusivamente para rank #1, selección y CTA. Un toggle sol/luna en el header cambia de tema en vivo, y `?theme=paper` en la URL restaura el tema actual pixel-igual. El tema se aplica con un atributo de data en el contenedor del atlas (no en `html`, para no interferir con el dark de shadcn), redefiniendo los tokens del ticket 01.

Reglas de performance del glow (sección M1/1c): prohibido `drop-shadow` por punto; los puntos de demanda "brillan" solo por color+opacidad; únicamente los ≤8 markers de oportunidad llevan filtro; viñeta de escenario como gradiente radial fijo (1 nodo DOM). El botón primario en night se invierte: fondo claro, texto `--on-ink`.

**Blocked by:** 01 (Prefactor — tokenizar colores hardcodeados)

**Status:** wontfix

- [ ] Default `night`; `?theme=paper` restaura el tema actual pixel-igual a hoy
- [ ] Toggle sol/luna en el header (mismo estilo que el botón de reset) cambia el tema en vivo
- [ ] Los 5 estados de vista + drawer + campaign + layers popover legibles con contraste AA en night
- [ ] Cian solo para señal/dato; ámbar solo para rank #1/selección/CTA; nada más
- [ ] Sin `drop-shadow` masivo: solo los markers de oportunidad llevan filtro; viñeta como gradiente fijo
- [ ] Captura en proyector (o brillo 100%) legible a 3 metros

Detalle de implementación (paleta concreta de partida incluida): secciones **M1 / 1b–1d** de la spec.

## Comments

- 2026-08-25: **wontfix** — decisión post-review: la estética paper actual ya se ve premium y destaca por contraste entre veinte proyectos oscuros con neón; además los proyectores con luz ambiente lavan los temas oscuros. Las ~3.5h de 01+02 se reasignan a Quiver, eventos y deploy temprano. La sección M1 del plan queda sin efecto.
