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

Demo del ticket 08: completar el intake → 202 con `runId` (queda en la URL como
`?run=…`) → detener el worker (Ctrl+C o `GROWTHX_WORKER_EXIT_AFTER_STEP=research_catalog pnpm worker`)
→ recargar el dashboard: el run sigue visible con sus pasos persistidos →
`pnpm worker` de nuevo: el run termina. La fuente del paso controlado es un
fixture de prueba (`lib/server/evaluations/fixture-catalog.ts`), material
preparado que no publica eventos ficticios como reales.

## 5. Tests de integración

`frontend/tests/integration/evaluation-run.test.ts` usa PostgreSQL y pg-boss
reales contra el contenedor local (crea un schema/estado propio por corrida).
Si `GROWTHX_ADMIN_DATABASE_URL` no está definida usa la URL del contenedor
local; si la base no responde, la suite se salta con aviso (arrancarla con
`pnpm db:up && pnpm db:migrate`).
