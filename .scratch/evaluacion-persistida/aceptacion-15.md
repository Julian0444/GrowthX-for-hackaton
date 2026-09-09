# Evidencia de aceptación — Ticket 15 (caídas y aislamiento)

Nota local de evidencia del ticket [15](./issues/15-aceptacion-caidas-y-aislamiento.md).
Fecha de la corrida: 2026-09-09. Entorno: contenedor local `growthx-postgres`
(postgres:17-alpine, 127.0.0.1:54329), Node v22, worker y Next como procesos
separados, Chromium vía Playwright. **Todo el material es sintético/preparado y
está etiquetado como tal; ningún proveedor real fue consultado.**

## Matriz automatizada: criterio → prueba

| Criterio del ticket | Prueba que lo demuestra |
| --- | --- |
| Suite con PostgreSQL y pg-boss reales, Next y worker en procesos separados, roles de aplicación, dos tenants, proveedores controlados | `tests/integration/worker-recovery.test.ts` + `tests/integration/tenant-isolation.test.ts` (bases dedicadas `growthx_t15_*` recreadas al inicio) + `tests/e2e/persisted-evaluation.spec.ts` (base principal, Next real reiniciado) |
| Interrupción abrupta durante obtención / tras guardar claims / tras guardar snapshot / antes de confirmar el job | `worker-recovery` subtests 1–5: SIGKILL real del proceso worker en barreras explícitas (`GROWTHX_WORKER_KILL_AT`, marker del transporte para el fetch EN VUELO); el mismo run llega a terminal sin perder avances confirmados ni duplicar efectos (conteos idénticos de claims/fuentes/revisiones; un solo snapshot; `attempts` exactos) |
| Fallo entre aceptación HTTP y despacho durable; entrega duplicada; dos workers compitiendo; llamadas HTTP no confirmadas repetidas y trazadas | `worker-recovery` subtests 5–7: cola caída ⇒ cero filas y cero jobs; job duplicado + dos workers vivos ⇒ un solo snapshot final y resultado idéntico; carrera determinística (compuertas, sin sleeps) ⇒ el intento perdedor no degrada el run terminal (**fallo demostrado en rojo y corregido en `run-worker.ts`**); el reintento del cliente con la misma clave queda trazado en `run_logs` |
| Timeout / salida inválida del modelo ⇒ dossier completo con explicación determinística y degradación; fuente agotando reintentos ⇒ fallido/parcial visible, sin recomendación preparada | `worker-recovery` subtests 8–9: transporte de modelo colgado (aborta por timeout) e inválido ⇒ `deterministic_only` con motivo, `usage: null` explícito, snapshot/orden idénticos; fuente caída ⇒ run `failed` con causa visible, 4 intentos, `result: null` |
| IDs conocidos del otro tenant rechazados por API, listados, lectura de fuentes, modificaciones, claims referenciados, sesiones, pool e idempotencia; job discordante rechazado por el worker; errores sin contenido del señuelo | `tenant-isolation` subtests 1–4 y 7–8: 404 idéntico a inexistente; listados sin mezcla; comparación/importación/decisión con ids ajenos rechazadas sin persistir; clave idempotente ajena crea run PROPIO; jobs forjados (tenant discordante y forma inválida) fallan en el worker real sin tocar el run; TODOS los cuerpos de respuesta auditados contra centinelas de ambos catálogos |
| Roles sin bypass; contexto de conexión reutilizada no se filtra; RLS bloquea la fila ajena | `tenant-isolation` subtests 5–6: pool `max: 1` (mismo `pg_backend_pid()` en todo el recorrido, incluida una transacción que falla a mitad de camino); `rolsuper`/`rolbypassrls` en false para los tres roles; UPDATE ajeno alcanza 0 filas; INSERT bajo otro tenant viola la política; rol de cola sin ningún grant de negocio |
| Navegador: pegar URL → dossier con pendientes → elegir condicionalmente → guardar → cerrar → reabrir; perfil → organizadores → antecedente → evento → decisión sin mapa; outcome ausente = desconocido; edición de otra ciudad no local | `persisted-evaluation.spec.ts`: la Demostración completa (cierre de pestaña, SIGKILL y reinicio del worker, reinicio de Next, recuperación por enlace interno con identidad/evidencia/condiciones cotejadas, señuelo sin lectura ni PATCH) + el recorrido de organizadores con `sf-map` en 0 todo el tiempo, «Resultado comercial desconocido» visible y `ed-berlin-future` fuera de la lista local |
| Logs reconstruyen run→steps→claims→snapshot→decisión con intentos/tiempos/degradación; sin secretos ni texto privado; uso/costo desconocido explícito | `worker-recovery` subtest 10: cadena completa por SQL bajo rol de aplicación; `run_logs` auditados contra tokens de sesión, contraseñas de roles y un centinela de texto privado embebido en el HTML importado; `usage: null` persistido en la degradación |
| Los cinco tests de v0 siguen activos y verdes; sin ampliación al loop de outcomes | `pnpm test:baseline` → 8/8, O1–O5 «corregido», sin INESPERADO; ninguna prueba nueva toca outcomes/ROI |

## Resultado de las pruebas automáticas (salida real, 2026-09-09)

```
pnpm --dir frontend test
  tests/**/*.test.ts                 → 179 pass / 0 fail
  tests/e2e/sf-organizer-research    →  11 pass / 0 fail
  tests/e2e/reopen-evaluation        →   7 pass / 0 fail
  tests/e2e/persisted-evaluation     →   5 pass / 0 fail
  exit 0  (corrido DOS veces seguidas con el mismo resultado)

pnpm --dir frontend lint             → exit 0, sin warnings
npx tsc --noEmit                     → limpio
pnpm --dir frontend build            → OK (next-env.d.ts restaurado tras el build)
pnpm --dir frontend test:baseline    → 8/8, O1–O5 «corregido», sin INESPERADO
```

## Guion de demo manual (recuperación + aislamiento)

Requisitos: `pnpm db:up && pnpm db:migrate`, sesión sembrada (`pnpm db:seed-dev`
imprime el token y ROTA el anterior), SIN claves de proveedor en el entorno.

1. **Pegar y cerrar.** `pnpm dev` + `pnpm worker`. En Eventos, pegar una URL de
   Luma (para demo sin red: arrancar el worker con
   `GROWTHX_WORKER_LUMA_FIXTURE=<fixture.json>` apuntando a una respuesta
   grabada). Al ver el 202 con su runId, cerrar la pestaña.
2. **Matar y reiniciar el worker.** `kill -9 <pid del worker>` durante la
   obtención (o arrancarlo con
   `GROWTHX_WORKER_KILL_AT=before_step_commit:persist_dossier` para el corte
   exacto). Reiniciar `pnpm worker`: el MISMO run llega a `completed`
   (la re-entrega tarda hasta `expireInSeconds` = 120 s si el kill fue abrupto).
3. **Reabrir el dossier.** Navegador nuevo → `/?run=<runId>` → Eventos →
   «Abrir dossier persistido»: campos ausentes declarados pendientes.
4. **Elegir condicionalmente.** Eventos → seleccionar la edición importada y una
   curada → «Comparar seleccionadas» → «Registrar decisión» → elegir con una
   condición completa (pregunta/respuesta esperada/efecto/responsable/plazo) →
   la campaña persistida se abre; copiar el «Enlace interno».
5. **Reiniciar Next.** Cerrar la pestaña, matar `next dev`, relanzarlo, pegar el
   enlace interno: misma decisión, misma revisión, mismos motivos, misma
   campaña; cero llamadas a proveedores.
6. **Señuelo.** Con la cookie de otra sesión (otro tenant): el mismo enlace da
   404 en el run y la decisión; un PATCH devuelve 404 y nada cambia.

## Aceptación humana — PENDIENTE (bloqueada por decisiones abiertas)

**Este apartado NO está cumplido y el criterio correspondiente del ticket queda
sin marcar.** D3 y D4 (spec) bloquean la aceptación con usuario y eventos
reales; D5 bloquea afirmar operación compartida (todo corrió local); con D1/D2
abiertas, la demo se presenta como **evaluación factual/condicional con
objetivo provisional y sin ranking comercial** — no como piloto comprado.

Cuando D3/D4 se resuelvan, registrar acá (sin declarar catálogo real por haber
pasado con fixtures, y sin dar por validada compra, recruiting ni mejora de
resultados):

- [ ] 2–5 eventos futuros reales de SF verificados (URLs + fecha de verificación):
- [ ] Dos organizadores distintos con antecedentes (ids + fuentes):
- [ ] Una URL de Luma permitida (permiso/base de uso documentada) y su smoke manual:
- [ ] Fecha de la aceptación:
- [ ] Revisor:
