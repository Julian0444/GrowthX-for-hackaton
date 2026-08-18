# Growth Atlas — Hackathon Product Brief

## La idea en una frase

**Growth Atlas es un motor de inteligencia para Developer Growth que recomienda en qué ciudades, comunidades y eventos debe invertir una empresa para conseguir desarrolladores activados y retenidos.**

No es solamente un directorio de eventos ni un mapa visual. El producto convierte señales fragmentadas en una decisión concreta, explicable y medible.

---

## El problema

Las empresas de APIs, infraestructura y developer tools invierten grandes cantidades de dinero en hackathons, eventos y comunidades sin poder responder con precisión:

- Qué evento les conviene patrocinar.
- En qué ciudad existe demanda por su producto.
- Qué comunidad tiene mayor afinidad técnica.
- Cuánto deberían invertir.
- Qué campaña deberían ejecutar.
- Cuántos participantes terminaron adoptando y reteniendo el producto.

Muchas startups concentran su presupuesto en San Francisco porque sus competidores también están allí. Sin embargo, el talento y la demanda están distribuidos globalmente.

Growth Atlas no sostiene que San Francisco sea una mala inversión. Su función es mostrar **cuándo el premium de SF está justificado y cuándo otra región puede producir mejores resultados**.

---

## Usuario inicial

La primera versión está dirigida a:

- Equipos de Developer Relations.
- Developer Marketing.
- Growth.
- Ecosystem y Partnerships.
- Community leads.
- Founders de compañías de APIs, IA e infraestructura.

El primer caso de uso es:

> Ayudar a una empresa de developer tools a decidir qué hackathon, comunidad o ciudad debería patrocinar para conseguir adopción, feedback técnico o talento.

---

## La métrica principal

Growth Atlas no optimiza impresiones, registros ni API keys entregadas.

La métrica central es:

> **Costo por desarrollador activado y retenido.**

Un desarrollador activado puede ser alguien que:

1. Generó una API key.
2. Realizó una primera llamada exitosa.
3. Construyó una integración funcional.
4. Regresó después del evento.
5. Continuó utilizando el producto al terminar los créditos.

---

## Flujo principal del producto

### 1. La empresa describe su producto

El usuario ingresa:

- Producto y problema que resuelve.
- Audiencia.
- Tecnologías o stack.
- Presupuesto.
- Objetivo: adopción, feedback, talento o awareness.

Ejemplo:

> Somos una plataforma de observabilidad para agentes. Tenemos un presupuesto de $20K y buscamos adopción y feedback técnico.

### 2. Growth Atlas estructura la intención

La IA identifica:

- Categoría del producto.
- Problema resuelto.
- Perfil de desarrollador buscado.
- Tecnologías relacionadas.
- Objetivo de la campaña.
- Restricciones de presupuesto.

### 3. El mapa rankea oportunidades

El mapa muestra ciudades y regiones ordenadas por oportunidad. Cada recomendación debe estar respaldada por evidencias, no solamente por un score.

### 4. La empresa inspecciona una ciudad

El panel de oportunidad muestra:

- Opportunity Score.
- Confidence Score.
- Demanda detectada.
- Actividad técnica.
- Eventos próximos.
- Comunidades relevantes.
- Competencia entre sponsors.
- Costo estimado.
- Fuentes y evidencias.

### 5. Growth Atlas compara alternativas

Ejemplo:

> San Francisco presenta mayor acceso a founders, inversores y feedback senior. Bangalore presenta mayor eficiencia estimada por desarrollador activado y una comunidad Python con alta afinidad.

### 6. Growth Atlas recomienda una campaña

La recomendación incluye:

- Evento o comunidad.
- Track sugerido.
- Premio.
- Workshop previo.
- Presupuesto.
- Mensaje para el organizador.
- Métricas a instrumentar.
- Código, API key o cohorte para atribuir resultados.

### 7. La empresa mide el resultado

Después del evento, la plataforma conecta:

```text
Empresa
+ producto
+ ciudad
+ comunidad
+ evento
+ inversión
→ activación
→ retención
→ conversión
```

Este ciclo de resultados es lo que permite que las recomendaciones mejoren con el tiempo.

---

## La demo para las hackathons

La demo debe contar una única historia de principio a fin.

### Escenario

> Una startup de observabilidad de agentes dispone de $20K. Quiere conseguir adopción y feedback técnico, pero no sabe si invertir nuevamente en San Francisco o explorar otra comunidad.

### Recorrido

1. Escribimos el perfil de la empresa.
2. Growth Atlas interpreta producto, audiencia y objetivo.
3. El mapa se actualiza y presenta oportunidades globales.
4. Seleccionamos una ciudad recomendada.
5. Mostramos las evidencias y el nivel de confianza.
6. Comparamos la oportunidad con San Francisco.
7. Abrimos un evento concreto.
8. Generamos la campaña recomendada.
9. Mostramos cómo se mediría activación y retención.

El objetivo es que el juez entienda en menos de dos minutos:

> Growth Atlas le dice a una empresa dónde invertir, por qué hacerlo, qué campaña ejecutar y cómo medir el resultado.

---

## Ingesta real de eventos

La demostración técnica principal será poder importar una URL pública de un evento.

Por ejemplo, al ingresar una página de Luma, Growth Atlas debería extraer:

- Nombre.
- Fecha y duración.
- Ciudad y ubicación.
- Organizador.
- Sponsors.
- Premios.
- Audiencia.
- Tracks o challenges.
- Jueces.
- Estado de inscripción.
- Requisitos.

Luego debe normalizar el evento y relacionarlo con:

- Una ciudad.
- Una comunidad.
- Tecnologías.
- Tipos de desarrolladores.
- Objetivos de growth compatibles.

Las tres hackathons en las que se presentará Growth Atlas pueden formar parte del dataset real de la demo.

---

## Fuentes de señales

Growth Atlas no debe depender de un scraper gigante ni de una única plataforma.

La arquitectura debe permitir conectores intercambiables.

### Eventos

- Luma.
- Eventbrite.
- Devpost.
- Calendarios públicos.
- Feeds autorizados.
- Eventos enviados por organizadores.

### Demanda

- X.
- Google Trends.
- Hacker News.
- Reddit.
- Stack Exchange.

### Actividad técnica

- GitHub.
- npm.
- PyPI.
- Proyectos y repositorios de hackathons.

### Datos del cliente

- Activaciones por país.
- Retención.
- Conversión de créditos.
- UTMs.
- API keys o códigos por evento.

Para la hackathon no necesitamos integrar todas estas fuentes. Necesitamos demostrar que el sistema tiene una arquitectura creíble y que por lo menos una ruta de ingesta funciona con datos reales.

---

## Opportunity Score

El score debe ser explicable. Una primera versión puede considerar:

```text
Demanda detectada              25%
Actividad técnica              20%
Calidad y afinidad de eventos  20%
Eficiencia de costos           15%
Ausencia de competidores       10%
Confianza de los datos         10%
```

El score no se debe presentar como una verdad científica. Cada recomendación debe mostrar:

- Qué factores la elevaron.
- Qué factores la redujeron.
- Qué evidencia se utilizó.
- Cuáles valores son estimaciones.
- Qué nivel de confianza tiene la ubicación inferida.

---

## Alcance de la versión de hackathon

### Imprescindible

- Onboarding por texto libre.
- Extracción de producto, audiencia, presupuesto y objetivo.
- Mapa mundial interactivo.
- Ranking de ciudades.
- Ingesta de eventos reales desde una URL.
- Panel de evidencia.
- Opportunity Score explicable.
- Confidence Score.
- Comparación con una alternativa.
- Generación de una campaña.
- Ejemplo de medición postevento.

### Deseable si queda tiempo

- Comparación lado a lado entre dos ciudades.
- Filtros por objetivo.
- Historial de recomendaciones.
- Exportación de un Opportunity Report.
- Feed de eventos próximos.
- Datos técnicos de GitHub o tendencias.

### Fuera de alcance

- Red social completa entre empresas.
- Marketplace y pagos de sponsorship.
- Aplicación móvil.
- Eventos de música, teatro o gastronomía.
- Scraping global perfecto de X.
- Integraciones completas con CRM.
- Predicciones financieras presentadas como certezas.

Estas funciones pertenecen a la visión futura, pero no deben distraer de la propuesta B2B inicial.

---

## Hackathons

### 1. YC Startup School Hackathon

**Fecha:** viernes 24 de julio de 2026, 10:00–22:00  
**Premios:** $5K+  
**Sponsors anunciados:** Cursor, Linq, Terac y Dynamic  
**Judges invitados:** Foundation Capital y Cursor  
**Registro:** aprobación, verificación de YC Startup School e inscripción en Luma  
**Evento:** <https://luma.com/dpp4ulna>

#### Cómo presentar Growth Atlas

Enfatizar:

- Arquitectura de ingesta.
- Fuentes intercambiables.
- Datos reales.
- Evidencias y confianza.
- Diferencia entre scraping y un motor de decisión.

Pitch:

> Construimos una infraestructura de señales intercambiables que convierte eventos, demanda y actividad técnica en decisiones de growth explicables y medibles.

### 2. c0mpiled-11: Startup School Hackathon

**Fecha:** viernes 24 de julio de 2026, 18:00–23:00  
**Construcción:** aproximadamente 18:20–21:45  
**Premios:** $3K, $1.5K y $500  
**Ubicación:** Transpose Platform, San Francisco  
**Estado:** completo, con lista de espera  
**Challenge:** YC Requests for Startups Summer 2026  
**Evento:** <https://luma.com/compiled-cp9o>

Los tracks más compatibles son:

- The AI Operating System for Companies.
- SaaS Challengers.

#### Cómo presentar Growth Atlas

Growth Atlas puede describirse como un sistema operativo de inteligencia para Developer Growth: conecta fuentes fragmentadas, recomienda una acción y cierra el loop con los resultados.

Pitch:

> Growth Atlas es el AI operating system para developer growth: conecta información fragmentada y cierra el loop entre decisión, campaña y resultado.

### 3. JacHacks San Francisco

**Fecha:** domingo 26 de julio de 2026, 8:00–22:00  
**Premios:** $10K+  
**Asistencia anunciada:** aproximadamente 500 personas  
**Sponsors:** Google DeepMind, NVIDIA, Lovable, Base44 y otros  
**Otros incentivos:** 15+ startups reclutando y judges de grandes compañías tecnológicas  
**Ubicación:** Founders, Inc., San Francisco  
**Registro:** aprobación requerida  
**Evento:** <https://luma.com/9x1573sw>

#### Cómo presentar Growth Atlas

Enfatizar:

- El impacto visual del mapa.
- La escala global.
- La experiencia completa del producto.
- La oportunidad de descubrir talento y demanda fuera de los mercados saturados.

Pitch:

> El talento y la demanda están distribuidos globalmente, pero los presupuestos de growth no. Growth Atlas muestra dónde están apareciendo los próximos usuarios de una empresa.

---

## Plan de ejecución

### Antes del viernes

- Estabilizar la UI actual.
- Reemplazar parte de los datos simulados con eventos reales.
- Implementar importación de una URL de Luma.
- Preparar un caso de uso reproducible.
- Preparar una demo de 90 segundos.
- Grabar un video de respaldo.

### Durante las hackathons del viernes

- Validar el mensaje con founders, DevRel y judges.
- Registrar preguntas y objeciones.
- No cambiar la tesis entre eventos.
- Observar qué parte genera mayor interés: datos, mapa, campaña o medición.

### Sábado

- Incorporar el feedback más repetido.
- Mejorar la explicación del score.
- Pulir el mapa y el panel de evidencia.
- Reducir cualquier paso que haga lenta la demo.

### Domingo

- Presentar una versión más pulida en JacHacks.
- Mostrar la evolución obtenida con feedback real.
- Enfatizar la visión global y el potencial de startup.

---

## Demo de 90 segundos

### 0–15 segundos — Problema

> Las compañías saben cuánto gastan en hackathons, pero no dónde encontrarán desarrolladores que realmente adopten su producto.

### 15–35 segundos — Input

Ingresamos el producto, audiencia, presupuesto y objetivo.

### 35–60 segundos — Inteligencia

El mapa rankea oportunidades y muestra eventos, demanda, actividad técnica, competencia y confianza.

### 60–75 segundos — Recomendación

Growth Atlas compara una ciudad con San Francisco y explica por qué conviene invertir allí.

### 75–90 segundos — Acción y resultado

Genera el track, premio, workshop y plan de medición.

Final:

> Growth Atlas no ayuda a organizar cualquier evento. Ayuda a decidir cuál vale la pena antes de gastar el dinero y mide si la decisión funcionó después.

---

## Visión futura

El punto de entrada es Developer Growth Intelligence.

La expansión puede avanzar por etapas:

```text
Intelligence
→ Campaign generation
→ Measurement
→ Sponsor and organizer network
→ Marketplace
→ Consumer event discovery
```

En el futuro, la infraestructura podría incorporar música, teatro, gastronomía y otros tipos de eventos. Sin embargo, la primera empresa se construye resolviendo un problema B2B específico, costoso y medible.

---

## Posicionamiento final

No presentar Growth Atlas como:

> Un mapa que scrapea eventos y redes sociales.

Presentarlo como:

> **La capa de inteligencia global que muestra a las compañías de developer tools dónde están apareciendo sus próximos usuarios, qué evento o comunidad deben elegir, qué campaña ejecutar y cómo medir el resultado.**
