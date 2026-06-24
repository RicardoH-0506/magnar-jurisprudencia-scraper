import * as fs from "fs";
import * as path from "path";
import { runJpPipeline } from "../jurisprudencia/jpScrapingPipeline";
import { runOefaPipeline } from "../oefa/oefaScrapingPipeline";
import { Logger } from "./logger";
import { CONFIG } from "../config/constants";

import { ensureDirExists } from "./helpers";

import { ScraperOptions } from "../types";

/**
 * Se encarga de la orquestación física, preparación de directorios, seteo de variables
 * de entorno de ejecución, resolución de límites por defecto y disparo de los pipelines.
 */
export async function runScrapers(options: ScraperOptions): Promise<void> {
  // Nos aseguramos de que el directorio de descargas exista
  ensureDirExists(CONFIG.DOWNLOAD_DIR);

  // Seteamos las variables de entorno según si es Sandbox u Online por dominio
  process.env.PJ_SANDBOX = options.pjSandbox ? "true" : "false";
  process.env.OEFA_SANDBOX = options.oefaSandbox ? "true" : "false";

  // Mantenemos compatibilidad con NODE_ENV para integraciones
  if (options.pjSandbox && options.oefaSandbox) {
    process.env.NODE_ENV = "test";
  } else if (!options.pjSandbox && !options.oefaSandbox) {
    process.env.NODE_ENV = "production";
  }

  const isSandboxPJ = options.pjSandbox || process.env.NODE_ENV === "test";
  const isSandboxOefa = options.oefaSandbox || process.env.NODE_ENV === "test";

  Logger.info(
    `--- Iniciando Sesión de Extracción (PJ en Sandbox: ${options.pjSandbox ? "SÍ" : "NO"}, OEFA en Sandbox: ${options.oefaSandbox ? "SÍ" : "NO"}) ---`
  );

  try {
    if (options.runPj) {
      const pages = options.pages !== undefined ? options.pages : (isSandboxPJ ? CONFIG.PJ.MAX_PAGES_TEST : 10);
      const docs = options.docs !== undefined ? options.docs : (isSandboxPJ ? CONFIG.PJ.MAX_DOCUMENTS_TEST : 50);
      await runJpPipeline(pages, docs);
    }
    if (options.runOefa) {
      const pages = options.pages !== undefined ? options.pages : (isSandboxOefa ? CONFIG.OEFA.MAX_PAGES_TEST : 10);
      const docs = options.docs !== undefined ? options.docs : (isSandboxOefa ? CONFIG.OEFA.MAX_DOCUMENTS_TEST : 50);
      await runOefaPipeline(pages, docs);
    }
    Logger.success("¡La ejecución del scraper finalizó de manera exitosa!");
  } catch (err: any) {
    Logger.error("El orquestador central se detuvo debido a un error crítico:", err);
    process.exit(1);
  }
}
