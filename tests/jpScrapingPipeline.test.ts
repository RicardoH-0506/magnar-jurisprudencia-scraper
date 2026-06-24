import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { runJpPipeline } from "../src/jurisprudencia/jpScrapingPipeline";
import * as jpClientProxy from "../src/jurisprudencia/jpClientProxy";
import { CONFIG } from "../src/config/constants";

// Mock jpClientProxy to intercept downloadPJFile and force failures
vi.mock("../src/jurisprudencia/jpClientProxy", async (importActual) => {
  const actual = await importActual<typeof import("../src/jurisprudencia/jpClientProxy")>();
  return {
    ...actual,
    downloadPJFile: vi.fn(),
  };
});

// Mock sleep helper to make tests run instantly without delay
vi.mock("../src/utils/helpers", async (importActual) => {
  const actual = await importActual<typeof import("../src/utils/helpers")>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Prueba de Integración: PJ Jurisprudencia Scraping Pipeline & DLQ", () => {
  const dlqFilePath = path.resolve(CONFIG.DLQ_FILE);
  const metadataFilePath = path.resolve("./jurisprudencia.json");
  let originalDlqExists = false;
  let originalDlqContent = "";

  beforeEach(() => {
    // Preservar fallidos.json existente si lo hubiera para evitar pisar datos del usuario
    if (fs.existsSync(dlqFilePath)) {
      originalDlqExists = true;
      try {
        originalDlqContent = fs.readFileSync(dlqFilePath, "utf-8");
      } catch (err) {
        originalDlqContent = "";
      }
      fs.unlinkSync(dlqFilePath);
    } else {
      originalDlqExists = false;
    }

    // Limpiar archivo jurisprudencia.json generado
    if (fs.existsSync(metadataFilePath)) {
      fs.unlinkSync(metadataFilePath);
    }
  });

  afterEach(() => {
    // Limpiar archivos generados por la prueba
    if (fs.existsSync(dlqFilePath)) {
      fs.unlinkSync(dlqFilePath);
    }
    if (fs.existsSync(metadataFilePath)) {
      fs.unlinkSync(metadataFilePath);
    }

    // Restaurar el fallidos.json original del usuario
    if (originalDlqExists) {
      fs.writeFileSync(dlqFilePath, originalDlqContent, "utf-8");
    }

    vi.restoreAllMocks();
  });

  it("Debería ejecutar el pipeline del PJ, registrar fallos en descargas y aislar los registros en el DLQ", async () => {
    // Configurar el mock para simular un fallo de descarga
    const simulatedError = new Error("Fallo de descarga simulado de PDF para PJ");
    vi.mocked(jpClientProxy.downloadPJFile).mockRejectedValue(simulatedError);

    // Ejecutar el pipeline de PJ (1 página, 5 descargas como máximo)
    // Nota: Dado que process.env.NODE_ENV = 'test', se ejecuta automáticamente en modo SANDBOX
    await runJpPipeline(1, 5);

    // 1. Validar que se guardó el archivo jurisprudencia.json con los registros parseados del sandbox html
    expect(fs.existsSync(metadataFilePath)).toBe(true);
    const metadata = JSON.parse(fs.readFileSync(metadataFilePath, "utf-8"));
    expect(metadata).toHaveLength(5);
    expect(metadata[0].nroRecurso).toBe("1121-2016");
    expect(metadata[1].nroRecurso).toBe("2341-2017");
    expect(metadata[2].nroRecurso).toBe("502-2019");

    // 2. Validar que la descarga fue llamada 5 veces (para los 5 registros)
    expect(jpClientProxy.downloadPJFile).toHaveBeenCalledTimes(5);

    // 3. Validar que se creó y pobló el archivo fallidos.json (DLQ)
    expect(fs.existsSync(dlqFilePath)).toBe(true);
    const dlqContent = JSON.parse(fs.readFileSync(dlqFilePath, "utf-8"));
    
    // Los 5 registros deberían haber fallado y estar en el DLQ
    expect(dlqContent).toHaveLength(5);

    // Verificar estructura del DLQ para la primera entrada
    expect(dlqContent[0].source).toBe("PJ");
    expect(dlqContent[0].error).toBe("Fallo de descarga simulado de PDF para PJ");
    expect(dlqContent[0].record.nroRecurso).toBe("1121-2016");
    expect(dlqContent[0].record.uuid).toBe("c8413c6d-4b4a-4d9c-8770-b8bb2aa1d5e5");

    // Verificar las entradas restantes
    expect(dlqContent[1].record.nroRecurso).toBe("2341-2017");
    expect(dlqContent[2].record.nroRecurso).toBe("502-2019");
    expect(dlqContent[3].record.nroRecurso).toBe("4410-2022");
    expect(dlqContent[4].record.nroRecurso).toBe("909-2023");
  });
});
