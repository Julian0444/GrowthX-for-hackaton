# 14 — Reabrir la decisión exacta desde el dashboard

Status: needs-triage

**Estado:** pendiente de revisión humana y cruzada; no autorizado para implementar.
**Especificación:** [evaluación persistida de SF](../spec.md).
Blocked by: [13](./13-guardar-decision-condicional.md).

## Objetivo

Hacer que una segunda consulta desde la UI actual recupere la evaluación y decisión guardadas sin recalcularlas ni reemplazarlas por una nueva búsqueda.

## Aristas de bloqueo

13 → 14: necesita una decisión guardada con revisiones y su campaña para demostrar lectura trazable tras cerrar la UI.

## Criterios de aceptación

- [ ] La UI del dashboard ofrece una lista mínima de evaluaciones guardadas del tenant, con estado, fecha, perfil, evento y acceso a la decisión. No se crea un producto separado de historial.
- [ ] Cerrar panel/pestaña y volver por la lista o enlace interno recupera `runId`, `snapshotId`, revisión de decisión y campaña originales desde PostgreSQL, incluso después de reiniciar Next.
- [ ] La segunda consulta es una lectura por identidad/filtros explícitos de perfil, no una búsqueda semántica de conversaciones. Presupuestos u objetivos diferentes no se mezclan porque coincida el texto del producto.
- [ ] Esa lectura no llama a Luma, Exa, Apify ni al modelo; tampoco dispara refrescos silenciosos, fixtures o nuevos scores. El dashboard, la lista de organizadores y el panel proyectan el snapshot guardado.
- [ ] Las evidencias y motivos muestran su fecha/revisión original. Si el evento ha vencido desde entonces, se agrega un aviso de vigencia actual sin alterar el resultado histórico.
- [ ] «Reevaluar» es una acción explícita que crea otro run con vínculo al anterior; permite usar nuevas revisiones y mantiene disponible la decisión previa. No es una edición encubierta de un snapshot.
- [ ] El contrato legado de lectura de Launch Room no queda como atajo a información en memoria o sin tenant. Las rutas usadas por el slice aplican la misma autorización y muestran errores distinguibles de «no hay decisión».
- [ ] Se preservan selección y regreso en dashboard → organizador → evento → campaña. El mapa local es opcional; el camino completo funciona sin abrirlo y no inventa ubicaciones.

## Demostración

Guardar una elección condicional, copiar su enlace interno, cerrar la app, reiniciar Next y volver. La pantalla muestra la misma evidencia y los mismos motivos con cero llamadas externas. Después crear una reevaluación y navegar a ambas versiones.

## Módulos y archivos probablemente afectados

`frontend/components/atlas/atlas-shell.tsx`, `frontend/components/atlas/result-rail.tsx`, `frontend/components/atlas/opportunity-drawer.tsx`, `frontend/components/atlas/campaign-panel.tsx`, `frontend/lib/api/atlas-client.ts`, `frontend/lib/api/opportunity-adapter.ts`, `frontend/app/api/decisions/[id]/route.ts`, rutas de evaluaciones.
Nuevos previstos: componente pequeño de lista de evaluaciones y `frontend/tests/e2e/reopen-evaluation.spec.ts`.

## Qué test lo demuestra

`reopen-evaluation.spec.ts`, con Next, worker y PostgreSQL reales: guardar → cerrar contexto del navegador → reiniciar Next → volver a autenticar → reabrir → cotejar IDs, motivos, claims y campaña. Contador del proveedor debe permanecer en cero durante lectura. Un segundo presupuesto crea otro perfil/run y nunca sustituye el anterior.

## Decisiones abiertas

**DECISIÓN ABIERTA D3:** acceso del usuario real al reabrir. La prueba de CI usa sesiones de test controladas; no acepta IDs de tenant elegidos por el cliente.
No se necesita decidir exportación o compartir públicamente para tener un enlace interno autenticado.
