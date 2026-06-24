import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../config/constants";
import { Logger } from "./logger";

import { DlqEntry } from "../types";

/**
 * Pausa la ejecución por un tiempo determinado (evita saturar el servidor).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Guarda un registro defectuoso en la Dead Letter Queue (fallidos.json) para análisis posterior.
 */
export function appendToDlq(source: "OEFA" | "PJ", record: any, errorMessage: string): void {
  const dlqPath = path.resolve(CONFIG.DLQ_FILE);
  let dlq: DlqEntry[] = [];
  
  if (fs.existsSync(dlqPath)) {
    try {
      const content = fs.readFileSync(dlqPath, "utf-8");
      dlq = JSON.parse(content);
    } catch (e) {
      Logger.error("No se pudo leer el fallidos.json existente. Reiniciando la cola DLQ.", e);
    }
  }

  dlq.push({
    timestamp: new Date().toISOString(),
    source,
    record,
    error: errorMessage,
  });

  try {
    fs.writeFileSync(dlqPath, JSON.stringify(dlq, null, 2), "utf-8");
    Logger.warn(`Registro aislado en la Dead Letter Queue (DLQ): ${CONFIG.DLQ_FILE}`);
  } catch (e) {
    Logger.error("No se pudo escribir el registro en el archivo DLQ.", e);
  }
}

/**
 * Se asegura de que un directorio exista, creándolo recursivamente si no es el caso.
 */
export function ensureDirExists(dirPath: string): void {
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
    Logger.info(`Directorio creado en: ${resolvedPath}`);
  }
}

/**
 * Generador ultra simple de UUID v4 compatible con RFC4122.
 */
export function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Limpia espacios en blanco múltiples y retornos de carro de un texto.
 * Retorna "N/D" si el texto está vacío.
 */
export function cleanText(text: string | undefined): string {
  if (!text) return "N/D";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned || "N/D";
}
