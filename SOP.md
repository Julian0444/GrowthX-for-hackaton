# SOP: piloto asistido de inteligencia para sponsorships de hackathons

## Qué hace

Growth Atlas ayuda a una startup early stage a investigar comunidades y eventos técnicos de San Francisco antes de comprometer presupuesto. Parte del producto, audiencia y objetivo del sponsor —adopción, feedback, contratación o awareness— y produce una comparación basada en evidencia, condiciones pendientes y una siguiente acción sugerida. La sección `Matches` conecta ese brief con oportunidades declaradas por organizadores, recomienda una activación y conserva un plan de medición cuando el sponsor solicita una introducción.

En el piloto, publicar oportunidades y solicitar una introducción ya son operaciones persistidas dentro del tenant. La entrega efectiva de la introducción cálida, la negociación y la medición posterior se operan como servicio asistido por personas. El repositorio actual no contiene un marketplace público entre tenants, pagos, contratación ni un predictor validado de ROI.

## Por qué se construyó así (build/buy/kill)

La decisión es **construir un núcleo estrecho y combinarlo con integraciones y operación manual**, no construir todavía una plataforma de eventos completa.

| Criterio | Puntaje (1–5) | Razón |
| --- | ---: | --- |
| Especificidad | 5 | La decisión cruza producto, ICP, objetivo, comunidad, formato, track, evidencia y resultados del sponsor; los marketplaces genéricos no resuelven ese razonamiento. |
| Volumen/urgencia | 2 | Solo existe un design partner documentado y los casos de recomendación e hiring son hipótesis de éxito, no resultados observados. |
| Costo de comprar | 3 | Existen herramientas para discovery, marketplace, CRM y operación de hackathons, pero ninguna sustituye toda la capa de decisión propuesta. |
| Tiempo a valor | 4 | El prototipo ya tiene brief, investigación, evidencia, comparación y decisión guardada; un piloto concierge puede validar el valor sin construir todo el marketplace. |
| Mantenimiento | 2 | El scraping amplio y los formatos cambiantes son costosos; conviene usar APIs, búsqueda dirigida, datos aportados por organizadores y revisión humana. |

**Construido en este corte:** oportunidades y paquetes append-only; matching determinista `strong / potential / limited` contra un brief persistido; razones, huecos de evidencia, formato y paquete compatible con presupuesto/ventana; plan de medición por objetivo; y solicitud de introducción idempotente que congela esa lectura. El expediente verificable del organizador y el historial de resultados atribuidos siguen siendo la siguiente fase.

**Comprar o integrar:** Exa y Apify para descubrimiento y lectura acotada; Luma cuando un organizador autorice acceso a su calendario; Devpost u otra herramienta especializada para registros, submissions, tracks, judging y analítica operativa; un CRM existente para contactos y seguimiento comercial.

**Mantener manual por ahora:** alta y verificación de organizadores, introducciones cálidas, negociación, contratos, cobros, aprobación del gasto, interpretación de feedback y cualquier decisión de contratación. No construir todavía mensajería, pagos, una base masiva de contactos ni scraping indiscriminado de la web o redes sociales.

Si el volumen creciera 10× y hubiera resultados repetibles, la decisión cambiaría parcialmente: convendría construir el portal del organizador, una cola de matches, actualización programada de evidencia y un ledger compartido de compromisos/resultados. La aprobación del sponsorship, el contacto y la contratación seguirían siendo humanos.

## Cómo correrlo

Requisitos: Node, pnpm, Docker y Google Chrome. Los comandos se ejecutan desde este repositorio.

1. Crear PostgreSQL la primera vez:

```bash
docker run -d --name growthx-reviewer-postgres \
  -e POSTGRES_USER=growthx \
  -e POSTGRES_PASSWORD=growthx \
  -e POSTGRES_DB=growthx \
  -p 127.0.0.1:55480:5432 \
  -v growthx-reviewer-data:/var/lib/postgresql/data \
  postgres:17-alpine
```

Para una instalación ya creada:

```bash
docker start growthx-reviewer-postgres
```

2. Crear `frontend/.env.local`, sin guardarlo en Git, con estas variables:

```dotenv
GROWTHX_ADMIN_DATABASE_URL=postgres://growthx:growthx@127.0.0.1:55480/growthx
GROWTHX_DATABASE_URL=postgres://growthx_app:growthx_app_dev@127.0.0.1:55480/growthx
GROWTHX_WORKER_DATABASE_URL=postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55480/growthx
GROWTHX_QUEUE_DATABASE_URL=postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55480/growthx
EXA_API_KEY=<clave-servidor>
APIFY_TOKEN=<token-servidor>
```

3. Instalar, migrar y crear una sesión local:

```bash
cd frontend
pnpm install --frozen-lockfile
node --env-file=.env.local lib/server/db/migrate.ts
node --env-file=.env.local lib/server/db/seed-dev.ts
```

El último comando imprime un token local. Configurarlo como cookie `growthx_session` para `localhost`; no copiarlo al repositorio ni a documentación.

4. Iniciar la aplicación:

```bash
pnpm dev --port 3001
```

5. En otra terminal, iniciar el worker:

```bash
cd frontend
pnpm worker:dev
```

6. Abrir `http://localhost:3001` y crear un brief nuevo. La guía completa está en `docs/local-development.md`.

### Flujo del matching

1. Guardar un brief de sponsor con audiencia, objetivo, presupuesto, ventana y formatos.
2. Entrar a `Matches`. En la perspectiva **I am an organizer**, operación asistida publica el evento, audiencia, estado de evidencia, formatos, paquete cash o in-kind y disponibilidad de track.
3. Volver a **I am a sponsor**. Revisar banda de fit, cobertura de evidencia, razones, datos pendientes, activación recomendada y plan de medición. Un evento pasado queda limitado y uno fuera de la ventana no puede ser `strong`.
4. Elegir **Request introduction**. La aplicación registra una solicitud; no envía mensajes, no acepta términos y no compromete presupuesto.
5. El owner del piloto revisa los huecos y realiza manualmente la introducción y el seguimiento.

Las oportunidades de este MVP son visibles solo dentro del tenant actual. Hacerlas públicas entre organizaciones requiere ownership, consentimiento y una política de publicación adicionales; no se debe relajar RLS para simularlo.

## Entradas y salidas

- Entrada del sponsor: descripción o URL del producto, ICP, objetivo, definición de éxito, presupuesto, fechas, geografía, formatos y restricciones. En el piloto también se registra qué activación quiere explorar: track, workshop, demo, cena, créditos, premio o contratación.
- Entrada del organizador: evento y comunidad, experiencia previa, temática, formatos disponibles, audiencia esperada y método de estimación, paquetes de sponsorship, capacidad de ofrecer un track, fechas, costos, referencias y resultados pasados atribuibles.
- Entrada de evidencia: páginas públicas, calendarios autorizados, dossiers aportados por el organizador y respuestas confirmadas. Emails, mensajes y relaciones privadas solo se incorporan con autorización explícita.
- Salida actual: investigación persistida, fuentes y claims, shortlist/comparación, preguntas abiertas, decisión condicional y brief de actividad; además, inventario tenant-local de oportunidades, banda de fit explicable, cobertura de evidencia, activación sugerida, plan de medición y solicitud de introducción registrada con snapshot inmutable.
- Salida manual del piloto: entrega de la introducción, verificación de condiciones, negociación y seguimiento del plan. La lectura de `Matches` no es una garantía de ROI ni una autorización de gasto.
- Salida futura, todavía no implementada: aceptación bilateral del match, ownership verificado del organizador, ledger de compromisos y resultado post-evento vinculado al objetivo.

## Casos límite conocidos

- **Audiencia prometida versus real:** en la entrevista de Terac se reportaron diferencias como 150 asistentes prometidos frente a unos 60 reales. La plataforma debe conservar estimación, fuente, método y resultado por separado.
- **Caso AI agents:** recomendar una temática, comunidad, formato y época es una hipótesis de éxito del producto. Hasta observar un sponsorship real, debe mostrarse como recomendación explicable, no como ROI demostrado.
- **Contratación:** contratar a una persona conocida en el hackathon puede producir valor alto, pero es un resultado tardío y multicausal. Debe registrarse como resultado reportado con período y atribución, no como consecuencia automática del evento.
- **Créditos versus efectivo:** créditos, cash, premio cubierto y costo operativo se registran por separado. Un valor nominal de créditos no equivale a efectivo.
- **Relación cálida no observable:** si no existe una introducción documentada, la aplicación no inventa grados de conexión ni datos de contacto.
- **Track sin uso verificable:** anunciar un track no demuestra adopción. Se requieren submissions o proyectos vinculados, método de conteo y, cuando sea posible, telemetría autorizada del producto.
- **Páginas bloqueadas o cambiantes:** el resultado conserva cobertura parcial y solicita verificación humana; no reemplaza datos faltantes con contenido sintético presentado como real.
- **Retry incierto:** publicar y solicitar introducción conservan la misma clave idempotente mientras el contenido no cambie. Cambiar el formulario crea una operación nueva; repetir el mismo POST no debe duplicar registros.
- **Introducción solicitada:** el estado `requested` solo registra intención y congela el match/plan. No demuestra que el organizador aceptó, que hubo contacto ni que exista un acuerdo.

## Umbral de aprobación humana

Toda recomendación es para revisión humana. Una persona debe aprobar antes de contactar a un tercero, presentar una introducción, compartir datos privados, negociar, firmar, pagar, publicar una promesa de audiencia o usar información para una contratación.

La recomendación no puede avanzar a “lista para comprometer presupuesto” si falta cualquiera de estos datos materiales: identidad del organizador, edición y fecha, audiencia y método de estimación, costo total, entregables del sponsor, reglas del track y plan de medición. Un modelo puede resumir evidencia admitida; no puede aprobar el gasto ni fabricar un retorno esperado.

## Mantenimiento

Pueden romper el flujo los cambios de Luma, Exa, Apify o páginas de organizadores; contenido renderizado o bloqueado; URLs reutilizadas entre ediciones; identidades duplicadas; fechas vencidas; y cambios en los contratos persistidos. La persona responsable de producto/ingeniería del piloto debe revisar fallos de extracción, fuentes antiguas, costos desconocidos y cambios de esquema antes de cada demo o piloto.

Todavía no existe un owner operativo nombrado para curación y seguimiento comercial. Antes de admitir más de diez matches activos al mes, debe asignarse ese owner, definir una cadencia de revisión y separar métricas verificadas de testimonios o resultados reportados.
