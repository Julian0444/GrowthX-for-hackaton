# Integración local de DP-05, DP-06 y DP-08

Verificada el 10/09/2026 en **http://localhost:3000**, con la sesión existente de Chrome del usuario y PostgreSQL local en **54329**. Se leyeron los tres tickets completos, sus cierres y README de evidencia; se contrastaron contratos, lector, persistencia, worker, migraciones y consumidores actuales. El plan/handoff anterior estaba desactualizado.

## Qué quedó habilitado

- Migraciones aditivas **008-source-reading, 009-dp06-relationships y 010-location-resolution** aplicadas en orden mediante el runner existente, conservando las contraseñas de roles configuradas. [Registro](migrations.json).
- `GROWTHX_GEOCODER=us-census` agregado a `.env.local`, ignorado por Git. Las demás entradas y claves se conservaron; ninguna credencial está en esta evidencia.
- Next dev en 3000 y worker con recarga automática reiniciados y activos. Node 25; [procesos y logs locales](processes.json). Se identificaron sus PID/comandos/cwd antes de detenerlos; no se reinició PostgreSQL.
- DP-05 aporta lectura completa y caché; DP-06 persiste identidades/antecedentes y luego llama a DP-08 antes de publicar. El importador Luma también usa la resolución común.
- No hizo falta modificar código de aplicación: DP-06 ya había corregido la regex incompatible con TypeScript y el guard de su DB de pruebas. El typecheck del árbol local ahora pasa sin parches en copias.

## Preservación de datos y código

Copia previa privada de PostgreSQL fuera del repositorio, permisos 0600: [metadatos y checksum](backup.json). No se reseteó ni restauró la base. Auditoría de todas las filas de las 29 tablas preexistentes por hash: **cero filas previas eliminadas o modificadas**, tanto después de migrar como al terminar los recorridos. [Antes](database-before.json), [después de migrar](database-migrated.json), [cierre](database-final.json).

Se conservaron los **638 runs**, **133 snapshots**, **152 decisiones** y **100 borradores de campaña** anteriores. Solo se agregaron cuatro investigaciones reales y su evidencia. No se cargaron fixtures, perfiles ni sesiones nuevos en localhost. Los datos sintéticos que la app ya tenía permanecen identificados como tales.

[Estado inicial](preflight.json), [contraste de manifiestos](ticket-manifests-check.json) y [59 archivos verificados](verified-files.json). Los cambios posteriores a DP-05/08 corresponden a la integración final de DP-06, cuyos 29 hashes coinciden con su cierre. Los 59 archivos de código/pruebas/configuración del conjunto coinciden con la copia compilada. No se sobrescribió ningún cambio de aplicación.

## Comprobación real en el navegador local

Los cuatro runs terminaron en `completed`. [IDs, lecturas, fallos, coordenadas, relaciones y proyección real del catálogo](real-local-results.json).

| Caso | Resultado observado |
| --- | --- |
| Dirección pública sin coordenadas | Hackathons.team publicó 501 Folsom St sin punto. Census devolvió lat 37.787215024828 / lng -122.394478898761. Dossier: `address`, `geocoded`, aproximada/interpolada, consulta, fecha, proveedor, versión y county 06075. El pin de la cuadrícula abrió el mismo dossier. [Dossier](address-dossier.txt). |
| Solo ciudad | Agent Arena permanece en la lista con “Solo ciudad o sede sin dirección pública; sin punto de venue”. El mapa tenía solo el marcador de Hackathons.team; cero consulta extra. [Dossier](city-dossier.txt), [lista y mapa](city-map.txt). |
| Coordenadas publicadas | Luma reutilizó lat 37.786980299999996 / lng -122.39447709999999, `published_coordinates`, proveedor `event JSON-LD`. Reimportó la identidad existente como nueva revisión. El contador Census siguió en 1. [Dossier](published-dossier.txt). |
| Organizador y antecedentes | AI Tinkerers actual → organizador → Secure Agents Buildathon 2025 → Google Cloud, sponsor anunciado → “Thank you to Google Cloud!” con localizador HTML. Vultr conserva host actual y sponsor reportado de RAISE 2025 en París. [Organizador](organizer.txt), [fragmento de edición anterior](previous-edition-company.txt). |
| Recarga e historia | Se reabrió AI Tinkerers con la misma identidad. La comparación anterior conserva snapshot `e70759ce-e7d4-4b34-9cb7-e1867d3db945`, decisión `5b4c495c-9957-419e-ba63-06d7ddf2ed15`, campaña y revisión antigua Luma `luma-70e00629-8a56-452e-a84c-f5944913c144-edition`. Su dossier mantiene la ubicación histórica pendiente, aunque el catálogo actual ya tenga coordenadas. También se abrió la investigación anterior `aeb693df-d82f-41a0-9d5b-ff7489dcaf7a`. [Comparación](historical-comparison.txt), [dossier histórico](historical-dossier.txt), [investigaciones guardadas](saved-investigations.txt), [investigación anterior reabierta](previous-research-reopened.txt). |

**Límite real de proyectos:** la galería, Citadel, Cleo y el directorio de AI Tinkerers respondieron HTTP 403. El run guardó dos páginas de seis intentadas y cobertura de cero proyectos; no se evadió la restricción ni se cargó la descarga histórica como dato nuevo. Por eso el recorrido con proyectos completos se acredita mediante transporte controlado en DB aislada, no como extracción real exitosa en localhost. El recorrido con organizador, edición previa y empresa sí se comprobó en vivo. La lectura actual sigue sin acreditar asistencia, ejecución de proyectos ni resultados comerciales.

Consumo: **13 lecturas HTTP públicas** (9 exitosas, 4 con 403), **1 consulta gratuita a Census**, **0 Exa**, **0 Apify**. Las recargas no añadieron lecturas ni geocodificaciones. Cupos existentes conservados: Exa USD 10 agregado, Apify USD 15 agregado; Census 3/run, 30/día y al menos 1 s entre inicios. No se amplió presupuesto ni se activó fallback de pago.

## Pruebas automatizadas aisladas

Contenedor `growthx-local-integration-verification`, PostgreSQL **55449**, copia temporal sin `.env*` ni claves, Next/worker/puertos/build propios. Se aplicaron allí las migraciones mediante las suites. Ninguna suite corrió contra 54329/3000.

- **318 pruebas** de funciones/integración, cero fallos/omisiones: [resultado](regression.json), [log](regression.log).
- **29 E2E**, siete suites, cero fallos/omisiones: [resultado](e2e.json), [log](e2e.log). Incluye lectura DP-05, recorrido DP-06 con dos proyectos controlados, recuperación, RLS y reapertura.
- Build combinado sin modificaciones de prueba: [resultado](build.json).
- TypeScript del árbol local: [resultado](typecheck-local.json). ESLint sobre los archivos TS/TSX de los tres tickets: [resultado](lint.json).

`run-isolated.py prepare` crea una copia idéntica, y `run-isolated.py <nombre> <comando...>` ejecuta con DB 55449 sin claves. [Ruta del build](production-path.txt). El contenedor de verificación se detuvo al cierre, conservando sus datos. App, worker y DB del usuario quedan activos.

## Pasos exactos para verlo

Usar el mismo Chrome con la sesión local existente; los enlaces no incluyen credenciales. No hace falta volver a investigar.

1. [Dirección resuelta](http://localhost:3000/?run=fda043a0-ae92-4809-b150-d0d71c62b1d8) → **Open background dossier** → **Ubicación pública → Procedencia de ubicación**. **Volver a eventos → Mapa** muestra el punto en la cuadrícula actual.
2. [Solo ciudad](http://localhost:3000/?run=7d43b762-b599-4759-b657-0848612a94c2) → **Open background dossier**. En Eventos, Agent Arena queda en lista sin pin.
3. [Coordenadas de Luma](http://localhost:3000/?run=4ea79f69-9aa0-45c4-a7b9-31fb3be59455) → **Abrir dossier persistido** → **Ubicación pública**.
4. [Antecedentes AIT](http://localhost:3000/?run=422c3de4-20c0-47a5-8e64-d23e0a8cac58) → **Open background dossier → AI Tinkerers San Francisco → AI Tinkerers SF - Secure Agents Buildathon → Google Cloud → Evidence for this edition and role**.
5. [Comparación anterior](http://localhost:3000/?run=21279a0a-9fe0-4968-b900-29af59463fe6) conserva la decisión y la evidencia originales. **Resumen → Investigaciones guardadas** permite abrir los briefs anteriores.

Para una fuente nueva: **Eventos → Background source URL → Research organizer & projects**. Para Luma también existe **Luma event URL → Importar**. Una investigación nueva consulta fuentes; abrir los enlaces guardados no lo hace.

## Pendientes

Los 403 impiden mostrar proyectos reales recién leídos en AIT. El mapa sigue siendo la cuadrícula: calles, agrupación de puntos superpuestos y navegación cartográfica pertenecen a DP-09. Sus consumidores ya reciben identidad/revisión, GeoJSON `[lng,lat]`, precisión, procedencia y motivos sin punto. La coincidencia de sede de F2/F3 no fusiona los eventos.

Sin incompatibilidad técnica pendiente entre DP-05/06/08. Sin commit, push, despliegue ni mensajes externos. Actualizados este registro, los README de evidencia de los tres tickets y el handoff; no se modificó el índice compartido.
