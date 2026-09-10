# DP-08 — Conservar ubicación y resolver direcciones a coordenadas

Status: ready-for-agent
Execution: pending

**Fase:** D — Ubicación.
**Especificación:** [DemoPuentes](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/spec.md>).
Blocked by: [DP-03](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/03-brief-y-contratos-de-investigacion.md>), [DP-05](</Users/jirustaroure/Desktop/GrowthX for hackaton/DemoPuentes/issues/05-lectura-completa-y-apify.md>).

## Objetivo

Hacer que un evento investigado con dirección pública pueda aparecer en el mapa sin perder precisión, incertidumbre o procedencia.

## Alcance y dependencias

Preservar dirección/venue/ciudad y coordenadas publicadas; resolver direcciones cuando falten coordenadas mediante adaptador configurable. Persistir el resultado como revisión de evidencia geográfica.

## Criterios de aceptación

- [ ] Coordenadas de la fuente válidas se usan con su procedencia y sin consulta adicional. Conservar orden lat/lng explícito entre contratos, GeoJSON y proveedores.
- [ ] Una dirección completa resuelta registra consulta, proveedor, método, precisión, fecha y vínculo al claim original; la persistencia cumple las condiciones del proveedor elegido.
- [ ] Elegir y documentar proveedor en este ticket después de comprobar disponibilidad, costo y almacenamiento; no asumir que créditos de Exa/Apify cubren otro servicio.
- [ ] Ciudad sola no genera pin de venue. Calle sin altura solo admite representación aproximada si la resolución es inequívoca; múltiples matches quedan pendientes.
- [ ] announced y confirmed pueden producir representación con etiqueta adecuada; geocodificar no confirma celebración ni acceso. Contradicciones materiales no quedan como punto exacto aparentemente cierto.
- [ ] No usar oficinas del organizador, centro de SF o direcciones ocultas como venue. La validación de SF no depende solamente de una bounding box.
- [ ] Cache por consulta normalizada y versión de fuente; límites de proveedor desde servidor. Fuente nueva puede crear revisión sin desplazar ubicaciones de snapshots anteriores.
- [ ] Una geocodificación fallida conserva evento y dirección en la lista, con causa legible; no bloquea el run de investigación.

## Demostración

Un evento con dirección completa y sin coordenadas obtiene ubicación trazable. Otro con solo SF permanece en la lista sin un falso marcador.

## Qué lo verifica

Dirección completa, calle ambigua, ciudad sola, homónimo en otra ciudad, lat/lng intercambiados detectables, coordenadas fuera de rango, source coordinates sin llamada, error del proveedor, caché y revisión histórica.

## Módulos y archivos orientativos

- `frontend/lib/api/luma.ts`
- `frontend/lib/contracts/evaluation.ts`
- `frontend/lib/contracts/evaluation-validation.ts`
- `frontend/lib/server/catalog/luma-adapter.ts`
- `frontend/lib/server/catalog/store.ts`
- `frontend/lib/server/catalog/read.ts`
- `frontend/lib/server/connectors/ (adaptador geográfico)`

La lista orienta la implementación; adaptar contratos y consumidores necesarios de forma coherente no exige abrir otro ticket por cada archivo.

## Fuera de alcance

Sin autocompletado global de direcciones ni rutas/tiempos de viaje. El proveedor es intercambiable; no atar los contratos al primer servicio.

## Entrega y cierre

Registrar archivos cambiados, resultado observable, comprobaciones ejecutadas y limitaciones. Actualizar el índice del plan y adjuntar evidencia real antes de marcar la entrega terminada. Compilar por sí solo no cumple los criterios de producto.

## Comments

Creado el 10 de septiembre de 2026 a partir de la redefinición y la solicitud de conservar el mapa. Trabajo especificado; implementación todavía no ejecutada por este ticket.
