import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../config/constants";
import { Logger } from "../utils/logger";
import { extractViewStateFromHtml } from "./jpDataParser";
import { SessionContext } from "../types";
import { ensureDirExists } from "../utils/helpers";

/**
 * Carga la página inicial simulada del PJ desde el fixture local.
 */
export async function fetchInitialPage(): Promise<SessionContext> {
  Logger.info("[Sandbox] Cargando la página inicial simulada del PJ desde el fixture local...");
  const fixturePath = path.resolve(CONFIG.PJ.SANDBOX_FIXTURE_PATH);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Sandbox fixture not found at path: ${fixturePath}`);
  }
  const html = fs.readFileSync(fixturePath, "utf-8");
  const viewState = extractViewStateFromHtml(html);
  return {
    cookies: "JSESSIONID=SANDBOX_MOCK_SESSION; _uzma=MOCK; _uzmb=MOCK",
    viewState,
  };
}

/**
 * Devuelve la página de búsqueda simulada del PJ usando el fixture local.
 */
export async function searchPJ(context: SessionContext): Promise<{ html: string; newContext: SessionContext }> {
  Logger.info("[Sandbox] Devolviendo la página de búsqueda simulada del PJ...");
  const fixturePath = path.resolve(CONFIG.PJ.SANDBOX_FIXTURE_PATH);
  const html = fs.readFileSync(fixturePath, "utf-8");
  return { html, newContext: context };
}

/**
 * Simula la paginación a una página específica devolviendo el mismo fixture local.
 */
export async function paginatePJ(
  page: number,
  context: SessionContext
): Promise<{ html: string; newContext: SessionContext }> {
  Logger.info(`[Sandbox] Simulando paginación a la página ${page} del PJ...`);
  const fixturePath = path.resolve(CONFIG.PJ.SANDBOX_FIXTURE_PATH);
  const html = fs.readFileSync(fixturePath, "utf-8");
  return { html, newContext: context };
}

/**
 * Simula la descarga creando un archivo PDF de prueba simulado localmente.
 */
export async function downloadPJFile(
  targetId: string,
  uuid: string,
  context: SessionContext
): Promise<string> {
  const targetDir = path.resolve(CONFIG.DOWNLOAD_DIR);
  ensureDirExists(targetDir);

  const outputFilePath = path.join(targetDir, `pj_${uuid}.pdf`);

  Logger.info(`[Sandbox] Simulando descarga de PDF del PJ para el UUID: ${uuid}...`);
  const dummyPdfContent = `%PDF-1.4\n% MOCK PDF FOR PJ UUID: ${uuid}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;
  fs.writeFileSync(outputFilePath, dummyPdfContent, "utf-8");
  Logger.success(`[Sandbox] Archivo de prueba guardado en disco: pj_${uuid}.pdf`);
  return outputFilePath;
}
