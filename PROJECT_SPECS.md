Aquí tienes el **Project Specification definitivo, unificado y blindado al 100%**. He integrado los tips, recomendaciones de buenas prácticas y la sección de control estricto de Robustez para el manejo de *edge cases*.

Con este documento, el equipo técnico de **Antigravity** tendrá un plano de ingeniería de nivel Senior para levantar el desarrollo de inmediato.

---

# 📑 Project Specification: High-Resilience Functional Scraper

## 1. Objetivo General

Desarrollar un agente automatizado en **TypeScript** estructurado bajo principios de programación funcional y peticiones HTTP nativas (browserless) para extraer, normalizar e indexar metadatos y descargar archivos binarios (PDFs) de dos portales estatales del Perú: el portal de Jurisprudencia del Poder Judicial (PJ) y el Repositorio Digital de la OEFA. El sistema debe garantizar resiliencia absoluta, evasión de rate limiting (429) y portabilidad internacional (Sandbox offline / Entorno alternativo abierto) para los evaluadores en Chile.

---

## 2. Restricciones Técnicas e Infraestructura (The Hard Rules)

* **Stack Obligatorio:** Node.js, TypeScript (`ts-node`, `typescript`), `axios` para el ciclo de red y `cheerio` para la manipulación y parseo del DOM en memoria.
* **Browserless Estricto:** Prohibido el uso de herramientas pesadas de automatización de interfaces (Puppeteer, Playwright, Selenium, etc.). Todo el flujo se emula mediante peticiones síncronas/asíncronas HTTP a nivel de protocolo de red.
* **Estrategia Anti-Geofencing:** El dominio del Poder Judicial (`*.pj.gob.pe`) bloquea por cortafuegos el tráfico fuera de Perú. Para que el equipo en Chile pueda calificar el proyecto sin fallos de conexión (`ETIMEDOUT`), se implementan dos mecanismos nativos:
1. **Modo Sandbox Desacoplado (`NODE_ENV=test`):** Desvía las llamadas HTTP del PJ hacia un archivo estático local simulado (`fixtures/jp-sample.html`).
2. **Vertical Slice Vivo (OEFA):** Conexión en tiempo real al portal público de la OEFA (`publico.oefa.gob.pe`), el cual está libre de bloqueos geográficos y expone el comportamiento del bot interactuando con servidores reales.



---

## 3. Arquitectura del Proyecto: Vertical Slices & Screaming Architecture

El diseño del software evita las capas de abstracción tradicionales y adopta **Rebanadas Verticales independientes por dominio**. El árbol de directorios describe explícitamente su propósito de negocio:

```text
scraper-challenge/
├── src/
│   ├── config/
│   │   └── constants.ts          # Endpoints, selectores CSS rígidos y payloads base
│   │
│   ├── jurisprudencia/           # 📦 SLICE 1: Dominio Poder Judicial de Perú
│   │   ├── jpParser.ts           # Funciones puras de Cheerio (HTML -> Data)
│   │   ├── jpClient.ts           # Cliente HTTP, manejo de JESSIONID y ViewState
│   │   └── jpPipeline.ts         # Orquestador del flujo funcional de este dominio
│   │
│   ├── oefa/                     # 📦 SLICE 2: Dominio OEFA (Conexión en vivo sin VPN)
│   │   ├── oefaParser.ts         # Extractor puro de filas y scripts onclick de Mojarra
│   │   ├── oefaClient.ts         # Paginación PrimeFaces AJAX y descargas binarias
│   │   └── oefaPipeline.ts       # Orquestador del flujo funcional de OEFA
│   │
│   ├── utils/                    # Helpers transversales puros
│   │   ├── retry.ts              # Higher-Order Function: Backoff Exponencial + Jitter
│   │   └── logger.ts             # Consola formateada para tracking de estados
│   │
│   └── index.ts                  # Orquestador central y switch de ejecución por entorno
├── fixtures/
│   └── jp-sample.html            # Clon HTML real del portal PJ para evaluación offline
├── downloads/                    # Destino en disco de las descargas en stream de los PDFs
├── tsconfig.json                 # Configuración de compilación (Strict Mode)
└── package.json                  # Scripts de ejecución automatizados

```

---

## 4. Contratos de Datos Unificados (Data Schemas)

### A. Esquema de Jurisprudencia (Poder Judicial)

```typescript
export type JurisprudenciaDocumento = {
  id: string;               // UUID v4 único generado en la extracción
  titulo: string;           // Nombre analítico de la resolución / recurso
  tipoPublicacion: string;  // Filtro seleccionado (ej: "Análisis Jurisprudencial", "Boletín")
  especialidad: string;     // Rama del derecho (ej: "Civil", "Comercial", "Penal")
  nroRecurso: string;       // Código identificador del expediente (ej: "1121-2016")
  sala: string;             // Órgano judicial emisor
  fechaResolucion: string;  // Fecha formal de emisión
  targetId: string;         // ID del componente JSF que gatilla el POST (ej: formBoletin:repeat:0:gridParticipante:0:j_idt73)
  uuid: string;             // Token de descarga extraído de la función onclick de Mojarra
};

```

### B. Esquema de Fiscalización (OEFA)

```typescript
export type OefaDocumento = {
  id: string;                     // UUID v4 único generado localmente
  nro: string;                    // Índice secuencial de la fila en la tabla (ej: "21")
  nroExpediente: string;          // Código identificador del expediente (ej: "5138-2008-PRODUCE...")
  administrado: string;           // Razón social o empresa fiscalizada (ej: "Pesquera Jada S.A.")
  unidadFiscalizable: string;     // Planta o locación física evaluada
  sector: string;                 // Rubro industrial (ej: "Pesquería")
  nroResolucionApelacion: string; // Resolución emitida por el TFA (ej: "117-2012-OEFA/TFA")
  targetId: string;               // ID del enlace de Mojarra (ej: "listarDetalleInfraccionRAAForm:dt:20:j_idt63")
  paramUuid: string;              // Token UUID del documento físico (ej: "25471c7c-40a5-42c6-a720-618a265d7c97")
};

```

---

## 5. Ingeniería Inversa del Protocolo: Estado y Ciclo de Vida JSF

Tanto el PJ como la OEFA operan sobre la especificación **JavaServer Faces (JSF)**. El bot mantendrá la consistencia de la sesión encapsulando los tokens en un objeto inmutable de contexto (`SessionContext { cookies: string[], viewState: string }`) que fluye a través de las funciones puras.

### 🏢 SLICE 1: Portal del Poder Judicial (JavaServer Faces + RichFaces)

#### A. Inicialización y Búsqueda

1. Un `GET` inicial al endpoint captura las cookies perimetrales (`JSESSIONID`, `_uzma`, `_uzmb`) y el token oculto base: `javax.faces.ViewState`.
2. Se ejecuta un `POST` emulando el comportamiento del elemento `<input type="image">` (`formBoletin:j_idt33`). Para gatillar la búsqueda, el payload `application/x-www-form-urlencoded` debe inyectar obligatoriamente las coordenadas de clic simuladas (`.x` y `.y`):

```typescript
export const crearPayloadBusquedaPJ = (viewState: string) => ({
  "formBoletin": "formBoletin",
  "formBoletin:txtTitulo": "",
  "formBoletin:buTipPublicacion": "0", // "-- Seleccione --"
  "formBoletin:buEspecialidad": "0",    // "-- Seleccione --"
  "javax.faces.ViewState": viewState,   // Server-side short token (ej: "3668783996191371327:-853365401090288810")
  "formBoletin:j_idt33.x": "45",        // Coordenada X ficticia de clic
  "formBoletin:j_idt33.y": "15"         // Coordenada Y ficticia de clic
});

```

#### B. Paginación Asíncrona (`rich:datascroller`)

El avance de páginas se realiza enviando un `POST` parcial AJAX de RichFaces que mantiene intacta la URL del navegador:

```typescript
export const crearPayloadPaginacionPJ = (page: number, viewState: string) => ({
  "formBoletin": "formBoletin",
  "formBoletin:txtTitulo": "",
  "formBoletin:buTipPublicacion": "0",
  "formBoletin:buEspecialidad": "0",
  "javax.faces.ViewState": viewState,
  "javax.faces.source": "formBoletin:data1",
  "javax.faces.partial.event": "rich:datascroller:onscroll",
  "javax.faces.partial.execute": "formBoletin:data1 @component",
  "javax.faces.partial.render": "@component",
  "org.richfaces.ajax.component": "formBoletin:data1",
  "formBoletin:data1": "formBoletin:data1",
  "formBoletin:data1:page": page.toString(), // Número de página destino (ej: "2")
  "AJAX:EVENTS_COUNT": "1",
  "javax.faces.partial.ajax": "true"
});

```

#### C. Descarga de PDFs Interceptando `mojarra.jsfcljs`

El bot raspará del HTML el identificador posicional de la fila (`targetId`) y el identificador del archivo (`uuid`) mediante expresiones regulares directas sobre el evento `onclick`:

```typescript
export const crearPayloadDescargaPJ = (targetId: string, uuid: string, viewState: string) => ({
  "formBoletin": "formBoletin",
  "formBoletin:txtTitulo": "",
  "formBoletin:buTipPublicacion": "0",
  "formBoletin:buEspecialidad": "0",
  "javax.faces.ViewState": viewState,
  [targetId]: targetId, // Dinámico: formBoletin:repeat:0:gridParticipante:0:j_idt73
  "uuid": uuid          // Dinámico: c8413c6d-4b4a-4d9c-8770-b8bb2aa1d5e5
});

```

---

### 🌿 SLICE 2: Repositorio Digital de OEFA (PrimeFaces + Mojarra)

#### A. Inicialización y Búsqueda Inicial

1. Un `GET` inicial extrae las cookies y el parámetro `javax.faces.ViewState` (token serializado extenso en Base64).
2. Se fuerza la aparición de registros enviando una petición AJAX de PrimeFaces vinculada a su botón de búsqueda:

```typescript
export const crearPayloadBusquedaOefa = (viewState: string) => ({
  "javax.faces.partial.ajax": "true",
  "javax.faces.source": "listarDetalleInfraccionRAAForm:btnBuscar",
  "javax.faces.partial.execute": "@all",
  "javax.faces.partial.render": "listarDetalleInfraccionRAAForm:pgLista",
  "listarDetalleInfraccionRAAForm:btnBuscar": "listarDetalleInfraccionRAAForm:btnBuscar",
  "listarDetalleInfraccionRAAForm": "listarDetalleInfraccionRAAForm",
  "listarDetalleInfraccionRAAForm:txtNroexp": "",
  "javax.faces.ViewState": viewState
});

```

#### B. Paginación AJAX de PrimeFaces

PrimeFaces utiliza el **índice base del primer registro** (`dt_first`) calculándolo mediante la fórmula: $firstRow = (página - 1) \times 10$:

```typescript
export const crearPayloadPaginacionOefa = (page: number, viewState: string) => {
  const firstRow = (page - 1) * 10; // Pág 2 = "10", Pág 3 = "20", etc.
  return {
    "javax.faces.partial.ajax": "true",
    "javax.faces.source": "listarDetalleInfraccionRAAForm:dt",
    "javax.faces.partial.execute": "listarDetalleInfraccionRAAForm:dt",
    "javax.faces.partial.render": "listarDetalleInfraccionRAAForm:dt",
    "listarDetalleInfraccionRAAForm:dt": "listarDetalleInfraccionRAAForm:dt",
    "listarDetalleInfraccionRAAForm:dt_pagination": "true",
    "listarDetalleInfraccionRAAForm:dt_first": firstRow.toString(),
    "listarDetalleInfraccionRAAForm:dt_rows": "10",
    "listarDetalleInfraccionRAAForm:dt_skipChildren": "true",
    "listarDetalleInfraccionRAAForm:dt_encodeFeature": "true",
    "listarDetalleInfraccionRAAForm": "listarDetalleInfraccionRAAForm",
    "listarDetalleInfraccionRAAForm:txtNroexp": "",
    "listarDetalleInfraccionRAAForm:dt_scrollState": "0,0",
    "javax.faces.ViewState": viewState
  };
};

```

#### C. Descarga de PDFs Interceptando `mojarra.jsfcljs`

El bot extraerá del `onclick` el `targetId` específico indexado con la fila (`dt:INDEX:j_idt63`) y el parámetro adicional `'param_uuid'`:

```typescript
export const crearPayloadDescargaOefa = (targetId: string, paramUuid: string, viewState: string) => ({
  "listarDetalleInfraccionRAAForm": "listarDetalleInfraccionRAAForm",
  "listarDetalleInfraccionRAAForm:txtNroexp": "",
  "listarDetalleInfraccionRAAForm:dt_scrollState": "0,0",
  [targetId]: targetId,               // Dinámico: listarDetalleInfraccionRAAForm:dt:20:j_idt63
  "param_uuid": paramUuid,             // Dinámico: 25471c7c-40a5-42c6-a720-618a265d7c97
  "javax.faces.ViewState": viewState   // String Base64 kilométrico
});

```

---

## 6. Módulo de Resiliencia, Tolerancia a Fallos y Buenas Prácticas

### 🕐 Delays Controlados entre Requests

Para mitigar la sobrecarga sobre la infraestructura estatal y evitar bloqueos por cortafuegos, el orquestador implementará una pausa obligatoria síncrona de seguridad fija (`CONFIG.BASE_DELAY_MS`) tras completar cada ciclo de extracción de página o descarga binaria individual.

### 🔄 Estrategia de Retry Inteligente (Error 429 / HTTP Network Drop)

* **Wrapper Funcional:** Las peticiones HTTP críticas se encapsularán en una función de orden superior (`retry.ts`).
* **Backoff Exponencial:** Ante una respuesta `429` (Too Many Requests) o un microcorte de socket, el retraso aumentará de forma geométrica: $Delay = Base \times 2^{intento}$.
* **Jitter Estadístico:** Se inyectará un factor matemático aleatorio de desincronización (ruido de milisegundos) para descentralizar los reintentos recurrentes y romper patrones predecibles ante el balanceador de carga del servidor.

### 💾 Almacenamiento Estructurado y Organización Física

* **Persistencia de Metadatos:** Al concluir la paginación, los documentos normalizados se guardarán inmediatamente de forma estructurada en formato **JSON** (`jurisprudencia.json` / `oefa.json`) dentro del directorio raíz, asegurando que la data quede indexada limpiamente.
* **Descarga Segmentada:** Los archivos PDF se capturarán configurando Axios con `responseType: 'stream'` para escribir directamente los chunks de bytes en disco dentro de una carpeta organizada llamada `./downloads`, segmentando los archivos mediante la nomenclatura estructurada `{id_entidad}_{uuid}.pdf` para evitar el desbordamiento de la memoria RAM.

### 📊 Monitoreo de Progreso (Logging Claro)

El scraper incorporará un helper de logging semántico (`utils/logger.ts`) que imprimirá en la consola de comandos la traza de ejecución de forma limpia y formateada, detallando:

* Número de página actual procesada sobre el total detectado.
* Volumen de registros recuperados con éxito.
* Tracking del token `ViewState` vigente empleado en la tubería inmutable de datos.
* Alertas visuales claras en caso de gatillarse reintentos por backoff.

### 🧪 Modo de Prueba Local (Filtros y Muestreo Temprano)

Para permitir pruebas inmediatas y seguras sin necesidad de barrer las miles de páginas del portal, el script admitirá la configuración de parámetros de corte temprano en la búsqueda de manera nativa. El pipeline podrá ejecutarse sobre un **subconjunto controlado** (ej: limitar el ciclo a procesar únicamente un lote inicial de 5 documentos o un tope de 2 páginas), validando la integridad del parser y de las descargas binarias antes de habilitar el raspado masivo de producción.

---

## 7. Robustez: Manejo Completo de Edge Cases y Errores Inesperados

Para asegurar que el bot mantenga un ciclo continuo de alta disponibilidad sin corromper los datasets o colapsar a mitad del flujo, la arquitectura implementará salvaguardas estrictas contra los siguientes escenarios anómalos:

### A. Auto-Recuperación por Expiración de Sesión (`ERR_CACHE_MISS`)

Debido a que el servidor de JavaServer Faces destruye el contexto del `JSESSIONID` tras periodos cortos de inactividad, el cliente de red interceptará las respuestas vacías, payloads con cadenas malformadas o redirecciones a pantallas de error de formulario.

* **Acción:** Si la sesión expira a mitad de la paginación, el flujo suspenderá temporalmente la lectura de la cola, disparará un sub-proceso síncrono de re-inicialización para capturar un juego de cookies fresco junto a un nuevo `ViewState` y reanudará automáticamente el scraping desde la última página procesada sin perder el progreso.

### B. Datos Faltantes, Columnas Vacías o Celdas Nulas

En portales estatales es común encontrar filas incompletas o resoluciones que no declaran explícitamente campos obligatorios como la "Materia" o la "Fecha de Emisión".

* **Acción:** El parser de Cheerio implementará coalescencia nula rigurosa y valores de contingencia por defecto (`"N/D"` o `"No Especificado"`) por cada propiedad del esquema. Si una celda crítica no existe, el bot continuará extrayendo el documento en vez de lanzar un puntero nulo (`TypeError: Cannot read properties of undefined`) que aborte la ejecución de la app.

### C. Captura de Excepciones en la Regex del Atributo `onclick`

Si el servidor actualiza el diseño gráfico o altera levemente los nombres internos de la función nativa (ej: cambiando de `j_idt73` a un ID autogenerado distinto en el backend), la expresión regular que extrae el UUID de descarga podría no emparejar ninguna cadena.

* **Acción:** La función selectora evaluará la presencia de la subcadena mediante bloques `try/catch`. En caso de que una fila posea un formato de botón de PDF irreconocible, el registro se omitirá del bloque de descargas binarias pero se mantendrá en el índice de metadatos, notificando el desajuste por el logger sin interrumpir el procesamiento de las tarjetas restantes.

### D. Aislamiento en Dead Letter Queue (DLQ)

* **Acción:** Aquellos registros o PDFs individuales que excedan el límite técnico de cinco reintentos debido a corrupción de origen en el servidor estatal no tumbarán la ejecución del bot. La función de resiliencia extraerá la fila defectuosa y la insertará en un archivo aislado de auditoría denominado `fallidos.json` (Cola de Cartas Muertas), permitiendo al script continuar limpiamente con la descarga del resto de documentos válidos.

---

### 🛠️ Archivos Base del Entorno Listos para Desplegar

#### 1. `package.json`

```json
{
  "name": "scraper-jurisprudencia-funcional",
  "version": "1.0.0",
  "description": "Scraper funcional de alta resiliencia para portales gubernamentales con JSF",
  "main": "src/index.ts",
  "scripts": {
    "start": "ts-node src/index.ts",
    "test:local": "cross-env NODE_ENV=test ts-node src/index.ts"
  },
  "keywords": ["scraper", "functional", "typescript", "cheerio", "jsf", "primefaces"],
  "author": "Ricardo Hidalgo",
  "license": "ISC",
  "dependencies": {
    "axios": "^1.7.9",
    "cheerio": "^1.0.0-rc.12"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "cross-env": "^7.0.3",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}

```

#### 2. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}

```