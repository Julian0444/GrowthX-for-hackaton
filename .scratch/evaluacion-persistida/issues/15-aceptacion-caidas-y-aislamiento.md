# 15 — Demostrar el slice completo bajo caídas y cruces de tenant

Status: needs-triage

**Estado:** pendiente de revisión humana y cruzada; no autorizado para implementar.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [11](./11-luma-a-dossier-durable.md), [14](./14-reabrir-desde-dashboard.md).

## Objetivo

Probar que la demo completa conserva runs y decisiones ante reinicios y no permite cruces entre el tenant real y el señuelo.

## Aristas de bloqueo

11 → 15: debe existir importación Luma integrada al workflow.
14 → 15: debe existir guardar/cerrar/reabrir desde la UI. Aquí convergen los dos recorridos; no basta probar cada servicio aislado.

## Criterios de aceptación

- [ ] La suite levanta PostgreSQL y pg-boss reales, Next y worker en procesos separados, con roles de aplicación y dos tenants. Los proveedores se controlan; no se simula la durabilidad con Maps.
- [ ] Se interrumpe el worker de forma abrupta durante obtención, después de guardar claims, después de guardar snapshot y antes de confirmar el job; al reiniciar, el mismo run llega a un estado terminal sin perder avances confirmados ni duplicar sus efectos.
- [ ] Se prueba fallo entre aceptación HTTP y despacho durable y entre commit de step y siguiente trabajo. La entrega duplicada y dos workers compitiendo no publican dos snapshots finales ni campañas/decisiones duplicadas. Llamadas HTTP no confirmadas pueden repetirse y quedan trazadas.
- [ ] Timeout o salida inválida del modelo completan el dossier con explicación determinística y estado de degradación. Error de fuente agotando reintentos queda fallido/parcial y visible; no aparece una recomendación preparada para ocultarlo.
- [ ] Con IDs conocidos del otro tenant, API, listados, lectura de fuentes, modificaciones, claims referenciados, sesiones, pool de conexiones e idempotencia rechazan el cruce. Un job con tenant/payload discordante es rechazado por el worker; los errores no revelan el contenido del señuelo.
- [ ] Se ejecuta con roles sin bypass y se verifica que el contexto de una conexión reutilizada no se filtra al siguiente tenant. Acceso directo de aplicación a una fila ajena queda bloqueado por RLS.
- [ ] La prueba de navegador completa pegar URL → dossier con campos pendientes → elegir condicionalmente → guardar → cerrar → reabrir, cotejando identidad, evidencia y condiciones. Otra prueba recorre perfil → organizadores pertinentes de SF → antecedente con empresa/rol → evento → decisión sin abrir el mapa. Un resultado comercial ausente se muestra desconocido; una edición de otra ciudad no se vuelve una oportunidad local.
- [ ] Logs permiten reconstruir run→steps→claim revisiones→snapshot→decisión, intentos, tiempos y degradación. No incluyen secretos ni texto privado innecesario; uso/costo desconocido sigue explícito.
- [ ] La aceptación humana verifica 2–5 eventos futuros reales de SF, con dos organizadores distintos y antecedentes y una URL de Luma permitida, con fecha/revisor registrados. No se declara catálogo real por pasar con fixtures ni se da por validada compra, recruiting o mejora de resultados.
- [ ] Se adjunta resultado de pruebas automáticas y guion de demo con evidencias de recuperación/aislamiento. Los cinco tests de v0 siguen activos y verdes; no se amplía el alcance para completar el loop de outcomes.

## Demostración

Una persona pega la URL y cierra la pestaña; otra detiene/reinicia el worker. Al volver, se abre el dossier y se guarda una decisión condicional. Tras cerrar y reiniciar Next, la misma persona la recupera; la sesión señuelo no puede leerla ni modificarla.

## Módulos y archivos probablemente afectados

`frontend/worker/`, `frontend/lib/server/evaluations/`, `frontend/lib/server/db/`, `frontend/lib/server/auth/`, rutas del slice y scripts de pruebas.
Nuevos previstos: `frontend/tests/integration/worker-recovery.test.ts`, `frontend/tests/integration/tenant-isolation.test.ts`, `frontend/tests/e2e/persisted-evaluation.spec.ts` y una nota local de evidencia de aceptación. Los cambios de runtime se limitan a fallos demostrados por esta matriz.

## Qué test lo demuestra

Los tres archivos anteriores usan barreras explícitas de prueba alrededor de commits para matar procesos y repetir los mismos puntos de fallo; no dependen de sleeps arbitrarios. Se verifica unicidad e identidad con consultas bajo roles apropiados, además del estado visible. Se ejecutan test, lint y build de frontend; un fallo previo ajeno se documenta y se distingue de una regresión del slice.

## Decisiones abiertas

**DECISIÓN ABIERTA D3 y D4:** bloquean la aceptación con usuario y eventos reales.
**DECISIÓN ABIERTA D5:** bloquea afirmar operación compartida si solo se probaron procesos locales.
**DECISIÓN ABIERTA D1/D2:** si siguen pendientes, la demo se presenta como evaluación factual/condicional con objetivo provisional y sin ranking comercial, no como piloto comprado.
