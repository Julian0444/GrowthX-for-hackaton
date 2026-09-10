# DP-01 — Verificación y handoff

Fecha: 2026-09-10. Revisor: Codex, con investigación delegada de antecedentes y contraste del agente principal. Verificación del alcance **documental de DP-01**, no aceptación de la app ni confirmación humana/comercial de los anuncios.

## Preparación y estado del repositorio

- Ticket, `spec.md` e `implementation-plan.md` leídos completos antes de ejecutar. De `finalProduct.md`: comprador, recorrido 1–2 y 4–10, sponsors/proyectos, presupuesto, demo, alcance y reglas de validación. También se consultaron auditoría y manifiesto de curación existente.
- `Blocked by: Ninguna`: no hay dependencia previa cuyo cierre deba acreditarse.
- Había 81 archivos modificados/no rastreados al registrar la huella SHA-256 a las 16:17:27 UTC, incluidos DemoPuentes, revisión previa y cambios de frontend. Se conservó la base en `/tmp/dp01-initial-worktree.json` para comparar durante esta ejecución; es un registro local temporal, no requisito de reproducibilidad del producto.
- No se modificaron consumidores de aplicación ni el manifiesto: el ticket pide referencia revisada, no implementar discovery/interfaz ni publicar una carga de catálogo. La integración y los contratos corresponden a tickets posteriores.
- Se detectaron cambios concurrentes ajenos en DP-02 y archivos de frontend (incluido `eligibility.ts`); no se editaron ni revirtieron. El cotejo distingue esos cambios de los tres documentos de seguimiento tomados por DP-01. La comprobación inicial que esperaba únicamente DP-02 como cambio externo falló al avanzar ese trabajo paralelo; se corrigió el alcance del informe, sin restaurar archivos ni declarar el árbol estable.

## Corte de soporte del caso

La comprobación de fuentes comenzó con el registro de las 16:17 UTC y alcanzó soporte a las **16:21 UTC**, dentro del bloque inicial previsto de 60–90 minutos. Se hizo un **corte anticipado al obtener evidencia suficiente**; no se afirma haber empleado 60 minutos ni se agregó espera artificial. El resto del trabajo documenta y revisa el conjunto.

**Decisión: mantener el comprador ilustrativo.** Cobertura: tres opciones futuras SF, antecedente positivo de proyectos de AI Tinkerers, historial de Vultr en un rol pasado de sponsor, ausencia explícita de ediciones previas de Hackathons.team y una ubicación pública completa con coordenadas enlazadas. La cobertura de trayectoria organizando eventos SF es parcial: no se afirma que Vultr organizara RAISE ni que Hackathons.team tenga resultados anteriores. Es suficiente para demostrar una comparación condicional, no para aprobar una compra.

## Matriz de criterios

| Criterio del ticket | Resultado observado | Evidencia |
| --- | --- | --- |
| Perfil, objetivo, presupuesto, ventana y carácter ilustrativo | Cumple: devtool de observabilidad; USD 5.000 total; 10/09–22/10/2026; comprador ficticio explícito. | [Caso, sección Comprador](dp-01-caso-y-fuentes.md#comprador-y-pregunta). |
| URL, consulta, fecha, ciudad, organizador/rol y pregunta por opción | Cumple: O1/O2/O3 con F1–F6, fechas locales, año estructurado de O3 y preguntas materiales; lectura separada de inferencia. | [Opciones](dp-01-caso-y-fuentes.md#tres-opciones-futuras-con-condiciones). |
| Sponsors/proyectos/recaps de edición; positivo y restricción | Cumple: AIT diciembre 2025 con proyectos y roles, Vultr/RAISE 2025 en París; no transferidos a septiembre 2026. Restricciones: aceptación, costos y falta de historial de la iniciativa nueva. | [ANT-01–05](dp-01-antecedentes.md), F4/F5. |
| Hallazgo que cambia investigación/modalidad/condición | Cumple: resultados de proyectos justifican explorar desafío instrumentado/soporte; falta de resultados propios obliga a pedir entregables y evidencia consentida. O3 priorizada por preparación y temática, sujeta a condiciones. | [Hallazgo](dp-01-caso-y-fuentes.md#hallazgo-que-cambia-la-decisión). |
| Ubicación respaldada sin reconstruir dirección oculta | Cumple: O2 publica dirección coincidente en dos fichas y coordenadas en enlace público. O1 queda oculta y O3 solo ciudad, sin pin. | [Ficha de ubicación](dp-01-caso-y-fuentes.md#ubicación-de-referencia-para-dp-0809), F2/F3. |
| Conjunto esperado, fragmentos y afirmaciones prohibidas; fixtures separados | Cumple: R1–R11 y fragmentos F/ANT, material real e ilustrativo separados del fixture existente. | [Referencia](dp-01-caso-y-fuentes.md#conjunto-de-referencia-revisado). |
| Decidir soporte durante la comprobación inicial | Cumple mediante corte anticipado explícito: mantener ejemplo, conservar cobertura parcial de roles/historial y costos pendientes. | Corte anterior; no extrapolar soporte comercial. |

## Comprobaciones ejecutadas

1. **Apertura de las tres fichas en navegador público**, sin registrarse. Se leyeron fechas, ciudad, contenidos, roles y acceso. O1 devolvía 403 por web/fetch, pero abrió completa en navegador; limitación de extracción conservada. F2 abrió por ambas vías. F6 abrió por ambas vías y su HTML devolvió HTTP 200.
2. **Contraste de tiempo:** JSON-LD de F6 con año 2026; conversión UTC a `America/Los_Angeles` concuerda con 26/09 09:00 y 27/09 17:00 PDT. O1 y O2 publican año 2026 en sus textos. Las tres fechas caen después del corte y dentro de la ventana ilustrativa.
3. **Demostración de diferencia:** abierta galería ANT-02 y seguido su enlace a The Citadel (ANT-03). El detalle muestra premio y herramientas; F4 muestra ausencia de eventos pasados y F5 modalidades generales. Consecuencia documentada: distinta confianza histórica y exigencia de evidencia/entregables, sin concluir ROI.
4. **Demostración de ubicación:** F2 abierta en navegador; sección Ubicación muestra calle, ciudad, código postal y enlace de Google Maps con latitud/longitud. F3 confirma dirección de esa edición. No se visitó una dirección obtenida tras registro ni se ejecutó geocodificación.
5. **Roles:** Vultr es host en F6; su recap ANT-05 lo describe como sponsor con lablab.ai organizador. Wasmer presentador/sponsor, hosts listados y EF venue partner se conservan separados. Sponsors de la edición AIT 2025 no se atribuyen a O1.
6. **Revisión local de entrega:** 37 enlaces Markdown locales resueltos, siete casillas de aceptación comprobadas contra esta matriz, cuatro fechas futuras dentro de ventana y dos conversiones UTC/PDT correctas. `git diff --check` sin errores; comprobación adicional de los seis Markdown de esta entrega, incluidos los no rastreados. Huellas iniciales comparadas: tres archivos previos modificados por DP-01; cambios concurrentes documentados aparte.

No se añadieron tests que dependan de vigencia externa. No se ejecutó build: no cambió código de la app y compilar no demostraría estos criterios. La lectura de repos/video del proyecto se limita a comprobar el vínculo publicado, no ejecución ni auditoría técnica del proyecto. No se guardaron listas de asistentes ni páginas completas.

## Archivos y continuidad

- Nuevos: `dp-01-caso-y-fuentes.md`, `dp-01-antecedentes.md` y esta verificación en `DemoPuentes/evidence/`.
- Seguimiento: Execution/Comments/checklist de DP-01, índice de `implementation-plan.md` y estado de `DemoPuentes/README.md`.
- DP-03 puede usar el comprador y los casos de referencia para definir contratos. DP-04/05 deben obtener fuentes realmente; DP-06 preservar relaciones; DP-07 condiciones; DP-08/09 ubicación/mapa. Nada de esto queda implementado por esta nota.
- Antes de DP-12, volver a abrir las fuentes: dos eventos ocurren en 2–3 días desde la revisión. Si ya pasaron, conservarlos como antecedentes o buscar nuevas futuras, sin mover sus fechas.
- Pendientes comerciales: disponibilidad, cotización completa, audiencia efectiva y posibilidad de integración/mentoría. No impiden cerrar investigación documental; impiden presentar una inversión como aprobada.
- No hubo commit, push, despliegue, mensajes externos, inscripciones ni modificaciones de DB. No se invocaron Exa/Apify, geocodificador ni cuotas nuevas; costo del buscador/navegador de esta sesión no informado, no asumido cero.
