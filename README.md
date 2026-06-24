# Scraper de Portales Gubernamentales con JSF — TypeScript

Scraper **browserless** desarrollado en TypeScript que extrae metadatos y descarga PDFs de dos portales gubernamentales peruanos construidos sobre JavaServer Faces (JSF):

| Portal | Framework | URL | Acceso |
|--------|-----------|-----|--------|
| **Poder Judicial** — Jurisprudencia | JSF + RichFaces | `jurisprudencia.pj.gob.pe` | Requiere VPN a Perú |
| **OEFA** — Repositorio Digital | JSF + PrimeFaces | `publico.oefa.gob.pe` | Accesible globalmente |

> **Sin Puppeteer, Playwright ni Selenium.** Todo funciona con peticiones HTTP directas (`axios`) y parseo en memoria (`cheerio`).

---

## Inicio rápido

```bash
# 1. Clonar el repositorio
git clone https://github.com/RicardoH-0506/magnar-jurisprudencia-scraper.git
cd magnar-jurisprudencia-scraper

# 2. Instalar dependencias
npm install

# 3. Ejecutar en modo Sandbox (offline, sin VPN — ideal para evaluación)
npm start -- --all-test

# 4. Ejecutar las pruebas automatizadas
npm test
```

El comando `npm start` sin flags levanta un **menú interactivo** en la terminal donde se puede elegir el portal, el modo (Sandbox / En Vivo) y los límites de páginas y descargas.

---

## Tabla de contenidos

- [¿Cómo funciona?](#cómo-funciona)
- [Modos de ejecución](#modos-de-ejecución)
- [Resiliencia y manejo de errores](#resiliencia-y-manejo-de-errores)
- [Modo Sandbox (evaluación offline)](#modo-sandbox-evaluación-offline)
- [Pruebas automatizadas](#pruebas-automatizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Datos extraídos](#datos-extraídos)
- [Stack tecnológico](#stack-tecnológico)

---

## ¿Cómo funciona?

Ambos portales corren sobre **JavaServer Faces (JSF)**, un framework con estado del lado del servidor. A diferencia de una API REST convencional, JSF exige que cada petición incluya:

1. **Una cookie de sesión válida** (`JSESSIONID`).
2. **Un token dinámico `javax.faces.ViewState`** que cambia con cada interacción.

Si estos dos valores se desalinean, el servidor invalida la sesión y la descarga falla.

### Ciclo de vida del scraper

```
┌──────────────────────────────────────────────────────────────────────────┐
│  1. GET inicial → Captura cookies + primer ViewState                     │
│  2. POST búsqueda (AJAX) → Obtiene la primera página + nuevo ViewState   │
│  3. Loop de paginación:                                                  │
│     ├─ Parsea filas de la tabla (HTML o XML/CDATA según el portal)       │
│     ├─ Descarga PDFs en stream (directo a disco, sin cargar en RAM)      │
│     ├─ Si falla → reintenta con backoff exponencial                      │
│     ├─ Si persiste → registra en DLQ (fallidos.json) y sigue             │
│     └─ Avanza a la siguiente página con el ViewState actualizado         │
│  4. Exporta metadatos estructurados a JSON                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Diferencia clave entre los dos portales

| Aspecto | Poder Judicial (PJ) | OEFA |
|---------|---------------------|------|
| Respuesta a búsqueda / paginación | HTML completo | XML con fragmentos HTML dentro de `CDATA` (PrimeFaces `<partial-response>`) |
| Extracción del ViewState | `cheerio` busca el `<input hidden>` en el HTML | Regex extrae el valor del `CDATA` dentro de `<update id="javax.faces.ViewState">` |
| Estructura de la tabla | `<table class="rf-dt">` con clases RichFaces | `<tbody id="...dt_data">` con clases PrimeFaces (`ui-datatable`) |

---

## Modos de ejecución

### Menú interactivo

```bash
npm start
```

Presenta un menú en español con 7 opciones: ejecutar cada scraper individual (Sandbox o En Vivo), ambos en modo prueba, ambos en modo producción, o salir.

### Flags de consola (bypass del menú)

| Comando | Descripción |
|---------|-------------|
| `npm start -- --pj-sandbox` | PJ en modo Sandbox (offline) |
| `npm start -- --pj-live` | PJ en vivo (requiere VPN a Perú) |
| `npm start -- --oefa-sandbox` | OEFA en modo Sandbox (offline) |
| `npm start -- --oefa-live` | OEFA en vivo |
| `npm start -- --all-test` | Ambos en Sandbox (2 páginas, 5 descargas) |
| `npm start -- --all-prod` | Ambos en vivo (10 páginas, 50 descargas) |

### Límites personalizados

```bash
# Recorrer 5 páginas de OEFA en vivo y descargar máximo 10 PDFs
npm start -- --oefa-live -p 5 -d 10
```

| Flag | Descripción |
|------|-------------|
| `-p <n>` / `--pages <n>` | Número máximo de páginas a recorrer |
| `-d <n>` / `--docs <n>` | Número máximo de PDFs a descargar |

---

## Resiliencia y manejo de errores

### 1. Reintentos con backoff exponencial y jitter

Implementado en `src/utils/retry.ts`. Todas las peticiones HTTP (GET inicial, búsquedas AJAX, paginación y descargas) pasan por la función `withRetry`, que:

- **Detecta errores 429** (Too Many Requests), errores de red (`ECONNRESET`, `ETIMEDOUT`) y errores de servidor (5xx).
- **Reintenta hasta 5 veces** con un retardo exponencial: `baseDelay × 2^(intento-1)` + un jitter aleatorio de 0–1000 ms.
- Si se agotan los reintentos, lanza el error para que el pipeline lo maneje.

### 2. Dead Letter Queue (DLQ)

Si la descarga de un PDF individual falla definitivamente, el documento **no detiene la ejecución**. En su lugar:

- Se registra en `fallidos.json` con timestamp, fuente (`OEFA` o `PJ`), el registro completo y el mensaje de error.
- El scraper continúa con el siguiente documento.
- Al finalizar, el archivo `fallidos.json` contiene todos los registros que requieren reintento manual.

### 3. Auto-recuperación de sesión expirada

Si la paginación falla (por ejemplo, porque el servidor expiró la sesión JSF), el pipeline:

1. Detiene el flujo actual.
2. Realiza un nuevo GET inicial para obtener cookies y ViewState frescos.
3. Repite la búsqueda para restablecer el contexto.
4. Reanuda la paginación desde la misma página donde estaba.

### 4. Descarga en stream

Los PDFs se escriben directamente a disco con `fs.createWriteStream`, sin acumular el binario completo en memoria RAM. Esto previene desbordamientos de memoria al descargar archivos pesados.

### 5. Coalescencia de nulos

Si una celda de la tabla viene vacía o malformada, se le asigna `"N/D"` (No Disponible) en lugar de lanzar un `TypeError`. El registro completa su flujo normalmente.

---

## Modo Sandbox (evaluación offline)

Para que el proyecto pueda evaluarse **sin VPN ni conexión a los servidores gubernamentales**, se incluye un modo Sandbox que simula el ciclo completo del scraper usando fixtures HTML locales:

| Fixture | Registros | Ubicación |
|---------|-----------|-----------|
| PJ (Jurisprudencia) | 5 resoluciones | `fixtures/jp-sample.html` |
| OEFA (Repositorio Digital) | 3 expedientes | `fixtures/oefa-sample.html` |

En modo Sandbox:
- Las peticiones HTTP se reemplazan por lecturas del fixture local.
- La descarga de PDFs genera archivos simulados en `./downloads/`.
- La lógica de parseo, paginación, DLQ y exportación de metadatos se ejecuta de forma idéntica al modo en vivo.

```bash
# Ejecución rápida en Sandbox
npm start -- --all-test
```

---

## Pruebas automatizadas

El proyecto incluye pruebas de integración con **Vitest** que verifican el mecanismo de tolerancia a fallos (DLQ) de punta a punta:

```bash
npm test
```

| Test | Qué valida |
|------|------------|
| `tests/oefaScrapingPipeline.test.ts` | Simula fallos de descarga en OEFA → verifica que los 3 registros se aíslan correctamente en `fallidos.json` |
| `tests/jpScrapingPipeline.test.ts` | Simula fallos de descarga en PJ → verifica que los 5 registros se aíslan correctamente en `fallidos.json` |

Las pruebas mockean `downloadOefaFile` / `downloadPJFile` para forzar errores y comprueban que:
- La metadata se genera correctamente (`oefa.json` / `jurisprudencia.json`).
- El archivo DLQ contiene exactamente los registros fallidos con su fuente, error y datos del documento.
- Los delays (`sleep`) se eliminan durante la ejecución para que los tests corran en menos de 2 segundos.

```
 ✓ tests/oefaScrapingPipeline.test.ts  (1 test)
 ✓ tests/jpScrapingPipeline.test.ts    (1 test)

 Test Files  2 passed (2)
 Tests       2 passed (2)
 Duration    ~1s
```

---

## Estructura del proyecto

```
scraper-challenge/
├── src/
│   ├── config/
│   │   └── constants.ts              # URLs, User-Agent, límites por defecto
│   │
│   ├── jurisprudencia/               # Dominio: Poder Judicial
│   │   ├── jpDataParser.ts           # Parseo HTML con Cheerio + extracción de ViewState
│   │   ├── jpLiveHttpClient.ts       # Peticiones HTTP reales (GET, búsqueda, paginación, descarga)
│   │   ├── jpMockSandboxClient.ts    # Cliente simulado con fixtures locales
│   │   ├── jpClientProxy.ts          # Proxy que delega al cliente real o al Sandbox
│   │   └── jpScrapingPipeline.ts     # Orquestador del flujo completo del PJ
│   │
│   ├── oefa/                         # Dominio: OEFA
│   │   ├── oefaDataParser.ts         # Parseo HTML/XML (CDATA PrimeFaces) + ViewState
│   │   ├── oefaLiveHttpClient.ts     # Peticiones HTTP reales (AJAX PrimeFaces)
│   │   ├── oefaMockSandboxClient.ts  # Cliente simulado con fixtures locales
│   │   ├── oefaClientProxy.ts        # Proxy que delega al cliente real o al Sandbox
│   │   └── oefaScrapingPipeline.ts   # Orquestador del flujo completo de OEFA
│   │
│   ├── types/                        # Interfaces TypeScript
│   │   ├── common.types.ts           # SessionContext, DlqEntry, ScraperOptions
│   │   ├── jp.types.ts               # JurisprudenciaDocumento
│   │   ├── oefa.types.ts             # OefaDocumento
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── utils/                        # Utilidades transversales
│   │   ├── cli.ts                    # Menú interactivo + parsing de flags de consola
│   │   ├── helpers.ts                # sleep, appendToDlq, ensureDirExists, cleanText
│   │   ├── http.ts                   # Wrapper de Axios para POST con cookies y headers AJAX
│   │   ├── logger.ts                 # Logger con colores y timestamps ISO
│   │   ├── orchestrator.ts           # Preparación de entorno y disparo de pipelines
│   │   └── retry.ts                  # withRetry: backoff exponencial + jitter
│   │
│   └── index.ts                      # Punto de entrada
│
├── tests/
│   ├── oefaScrapingPipeline.test.ts  # Test de integración: DLQ de OEFA
│   └── jpScrapingPipeline.test.ts    # Test de integración: DLQ del PJ
│
├── fixtures/
│   ├── jp-sample.html                # HTML real del PJ para el modo Sandbox
│   └── oefa-sample.html              # HTML real de OEFA para el modo Sandbox
│
├── downloads/                        # PDFs descargados (generado en ejecución)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Datos extraídos

### Poder Judicial — `jurisprudencia.json`

```json
{
  "id": "uuid-v4",
  "titulo": "SENTENCIA DE CASACIÓN Nº 1121-2016 LIMA",
  "tipoPublicacion": "Boletín",
  "especialidad": "Civil",
  "nroRecurso": "1121-2016",
  "sala": "Sala Civil Permanente",
  "fechaResolucion": "24/11/2016",
  "targetId": "formBoletin:repeat:0:gridParticipante:0:j_idt73",
  "uuid": "c8413c6d-4b4a-4d9c-8770-b8bb2aa1d5e5"
}
```

### OEFA — `oefa.json`

```json
{
  "id": "uuid-v4",
  "nro": "1",
  "nroExpediente": "EXP-001-2026-MIN",
  "administrado": "EMPRESA MINERA REAL S.A.",
  "unidadFiscalizable": "UNIDAD MINERA AURORA",
  "sector": "Minería de Metales",
  "nroResolucionApelacion": "RESOLUCION-010-2026-TFA",
  "targetId": "listarDetalleInfraccionRAAForm:dt:0:j_idt63",
  "paramUuid": "oefa-mock-uuid-alpha"
}
```

Los PDFs se guardan en `./downloads/` con nombres descriptivos: `pj_<uuid>.pdf` y `oefa_<paramUuid>.pdf`.

---

## Stack tecnológico

| Categoría | Tecnología |
|-----------|-----------|
| Lenguaje | TypeScript (strict mode) |
| Runtime | Node.js |
| HTTP Client | Axios |
| HTML/XML Parser | Cheerio |
| Testing | Vitest |
| Compilador | tsc (ES2022, CommonJS) |

**Sin dependencias de navegador** — el proyecto no usa Puppeteer, Playwright, Selenium ni ninguna librería basada en WebDriver.

---

## Autor

**Ricardo Hidalgo**

---

## Licencia

ISC
