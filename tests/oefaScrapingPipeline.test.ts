import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { runOefaPipeline } from "../src/oefa/oefaScrapingPipeline";
import * as oefaClientProxy from "../src/oefa/oefaClientProxy";
import { CONFIG } from "../src/config/constants";

// Mock oefaClientProxy to intercept downloadOefaFile and force failures
vi.mock("../src/oefa/oefaClientProxy", async (importActual) => {
  const actual = await importActual<typeof import("../src/oefa/oefaClientProxy")>();
  return {
    ...actual,
    downloadOefaFile: vi.fn(),
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

describe("Prueba de Integración: OEFA Scraping Pipeline & DLQ", () => {
  const dlqFilePath = path.resolve(CONFIG.DLQ_FILE);
  const metadataFilePath = path.resolve("./oefa.json");
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

    // Limpiar archivo oefa.json generado
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

  it("Debería ejecutar el pipeline de OEFA, registrar fallos en descargas y aislar los registros en el DLQ", async () => {
    // Configurar el mock para simular un fallo de descarga
    const simulatedError = new Error("Fallo de descarga simulado de PDF para OEFA");
    vi.mocked(oefaClientProxy.downloadOefaFile).mockRejectedValue(simulatedError);

    // Ejecutar el pipeline de OEFA (1 página, 3 descargas como máximo)
    // Nota: Dado que process.env.NODE_ENV = 'test', se ejecuta automáticamente en modo SANDBOX
    await runOefaPipeline(1, 3);

    // 1. Validar que se guardó el archivo oefa.json con los registros parseados del sandbox html
    expect(fs.existsSync(metadataFilePath)).toBe(true);
    const metadata = JSON.parse(fs.readFileSync(metadataFilePath, "utf-8"));
    expect(metadata).toHaveLength(3);
    expect(metadata[0].nroExpediente).toBe("EXP-001-2026-MIN");
    expect(metadata[1].nroExpediente).toBe("EXP-002-2026-PES");
    expect(metadata[2].nroExpediente).toBe("EXP-003-2026-IND");

    // 2. Validar que la descarga fue llamada 3 veces (para los 3 registros)
    expect(oefaClientProxy.downloadOefaFile).toHaveBeenCalledTimes(3);

    // 3. Validar que se creó y pobló el archivo fallidos.json (DLQ)
    expect(fs.existsSync(dlqFilePath)).toBe(true);
    const dlqContent = JSON.parse(fs.readFileSync(dlqFilePath, "utf-8"));
    
    // Los 3 registros deberían haber fallado y estar en el DLQ
    expect(dlqContent).toHaveLength(3);

    // Verificar estructura del DLQ para la primera entrada
    expect(dlqContent[0].source).toBe("OEFA");
    expect(dlqContent[0].error).toBe("Fallo de descarga simulado de PDF para OEFA");
    expect(dlqContent[0].record.nroExpediente).toBe("EXP-001-2026-MIN");
    expect(dlqContent[0].record.paramUuid).toBe("oefa-mock-uuid-alpha");

    // Verificar las entradas restantes
    expect(dlqContent[1].record.nroExpediente).toBe("EXP-002-2026-PES");
    expect(dlqContent[2].record.nroExpediente).toBe("EXP-003-2026-IND");
  });
});
