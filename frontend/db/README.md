# Base de evaluaciones persistidas (ticket 08)

Cómo arrancar PostgreSQL, migrar, sembrar una sesión de desarrollo y correr
Next + worker. Todos los comandos van desde `frontend/`.

## 1. PostgreSQL (Docker, solo local)

```bash
pnpm db:up      # postgres:17-alpine en 127.0.0.1:54329, contenedor growthx-postgres
pnpm db:down    # lo elimina (borra los datos)
```

Credenciales del contenedor local: usuario/clave/db `growthx` — material de
desarrollo, no un secreto. Dónde corren PostgreSQL y el worker de un piloto
compartido es la **decisión abierta D5**; nada de esto habilita una instalación
compartida.

## 2. Variables de entorno

En el repo **no se guardan secretos**: exportá las URLs (o ponelas en
`frontend/.env.local`, que está gitignoreado). Para el contenedor local:

```bash
export GROWTHX_ADMIN_DATABASE_URL="postgres://growthx:growthx@127.0.0.1:54329/growthx"
export GROWTHX_DATABASE_URL="postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx"
export GROWTHX_WORKER_DATABASE_URL="postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx"
export GROWTHX_QUEUE_DATABASE_URL="postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx"
```

Las contraseñas de los roles de aplicación las fija el runner de migraciones:
por defecto las de arriba (solo local); en cualquier entorno compartido se
pasan por `GROWTHX_APP_DB_PASSWORD`, `GROWTHX_WORKER_DB_PASSWORD` y
`GROWTHX_QUEUE_DB_PASSWORD` antes de migrar.

Roles (sin privilegios de propietario ni bypass; RLS con FORCE):

| Rol | Uso | Acceso |
| --- | --- | --- |
| `growthx_app` | rutas Next (`/api/evaluations`) | identidad + negocio bajo RLS + encolado send-only |
| `growthx_worker` | negocio del worker | solo negocio bajo RLS (sin sesiones/pertenencias) |
| `growthx_queue` | pg-boss (dueño del esquema `pgboss`) | **sin** grants sobre el esquema de negocio |

## 3. Migrar y sembrar

```bash
pnpm db:migrate    # roles + db/migrations/*.sql + esquema pgboss + cola
pnpm db:seed-dev   # tenant growthx-dev + usuario + sesión; imprime el token
```

El token de sesión se imprime por stdout y no se persiste en el repo. Para el
navegador: `document.cookie = "growthx_session=<token>; path=/"` en
localhost:3000. El mecanismo de identidad de la demo compartida es la
**decisión abierta D3**; el contexto de tenant inyectado sin token queda
restringido a los tests.

## 4. Correr la app y el worker

```bash
pnpm dev      # Next en :3000 (o la entrada growthx-frontend de .claude/launch.json)
pnpm worker   # proceso worker separado (pg-boss + pasos del run)
```

Para trabajar en local con recarga automática, usá `pnpm dev` y, en otra
terminal, `pnpm worker:dev`. Este último carga `frontend/.env.local` y reinicia
el worker cuando cambia su código o sus módulos importados. Next actualiza
la página al guardar los cambios. Mantené Docker y ambos procesos activos;
si cambiás las variables de entorno, reiniciá los procesos.

Demo del ticket 08: completar el intake → 202 con `runId` (queda en la URL como
`?run=…`) → detener el worker (Ctrl+C o `GROWTHX_WORKER_EXIT_AFTER_STEP=research_catalog pnpm worker`)
→ recargar el dashboard: el run sigue visible con sus pasos persistidos →
`pnpm worker` de nuevo: el run termina. Sin catálogo, el paso declara cobertura insuficiente (DP-03); no rellena
la investigación con fixtures. Las pruebas cargan material sintético de forma
explícita en un tenant aislado.

## 5. Tests de integración

`frontend/tests/integration/evaluation-run.test.ts` usa PostgreSQL y pg-boss
reales contra el contenedor local (crea un schema/estado propio por corrida).
Si `GROWTHX_ADMIN_DATABASE_URL` no está definida usa la URL del contenedor
local; si la base no responde, la suite se salta con aviso (arrancarla con
`pnpm db:up && pnpm db:migrate`).


## DP-03: extensiones compatibles del brief y la evidencia

No requiere migración SQL: brief, preguntas, fragmentos y relaciones utilizan
los JSONB existentes. `profiles.payload` conserva confirmación, éxito,
restricciones, formatos y geografía; `runs.input.researchPlan` fija preguntas,
versión del perfil y cupos separados del presupuesto comercial. Una entrada
anterior sin plan se lee como `null`.

Fuentes/claims/ediciones admiten fragmentos y ubicación con precisión explícita.
Los upserts validan el contrato y la pertenencia de cada fuente, fragmento y
entidad al tenant. Las lecturas de catálogo y snapshots incluyen esos campos.
No se modifican registros históricos para asignar precisión a coordenadas
anteriores. Progreso y consumo por proveedor quedan definidos para DP-04/05;
no se habilita gasto ni una nueva infraestructura durable.

## DP-04: discovery real y acotado

La migración aditiva `007-discovery-exa.sql` agrega planes/operaciones bajo RLS
y un cupo común de Exa; se aplica con el runner de migraciones existente.
El formulario crea `sf-discovery/1`. Los runs anteriores `sf-organizers/1`
mantienen su lectura original.

Configurar `EXA_API_KEY` solamente en el servidor/worker (`frontend/.env.local`
en desarrollo, ignorado por Git). `pnpm worker:dev` carga ese archivo; después
de cambiar una clave hay que reiniciar el worker o provocar un reinicio de su
watch por un cambio de código. No colocar la clave en variables `NEXT_PUBLIC_`.

Límites: 3 consultas, 5 resultados por consulta, 12 s por solicitud y 45 s por
run desde que empieza discovery, conservados tras reinicios. Cada intento
reserva USD 0,02 antes de enviar; hasta USD 0,06 por run, dentro de un cupo
común de USD 10 por instalación PostgreSQL. Una respuesta incierta conserva
la reserva y no se reenvía automáticamente. El costo informado y desconocido
se muestran aparte; el cupo no representa el saldo de la cuenta ni el
presupuesto comercial. No se modifica ni reinicia el cupo al crear otro tenant.

Si el proveedor informa un costo mayor que la reserva, `discovery_allowance`
queda suspendido. Una revisión administrativa debe reconciliar los intentos
y las tarifas antes de reanudar; no resetear el saldo para desbloquear un run.
Los roles app/queue no pueden modificar el cupo.

Las fuentes propuestas viven en `growthx.sources`. La respuesta y cada
intento viven en `discovery_operations`, y el resultado final en `runs.result`.
`EvaluationRunView.discovery` es la entrada para DP-05/06: candidatos por URL,
sourceIds y consultas; todavía sin inventar ediciones. El almacén de claims
rechaza usar directamente un resultado de búsqueda como evidencia.

Sin key o con falla/cupo agotado se conserva progreso parcial/insuficiente y
no se consulta el catálogo sintético como fallback. Las pruebas controladas
usan `GROWTHX_WORKER_EXA_FIXTURE` explícito y etiquetan su material como
sintético; ese transporte no se activa por ausencia de credenciales.

La evidencia y la consulta real opt-in están en
[DP-04](../../DemoPuentes/evidence/DP-04/README.md). Los tests de CI no llaman a
Exa ni cargan `.env.local`.
