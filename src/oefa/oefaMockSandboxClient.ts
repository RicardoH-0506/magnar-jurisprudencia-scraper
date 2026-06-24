import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../config/constants";
import { Logger } from "../utils/logger";
import { extractViewStateFromHtml } from "./oefaDataParser";
import { SessionContext } from "../types";
import { ensureDirExists } from "../utils/helpers";

/**
 * Carga la página inicial simulada de OEFA desde el fixture local.
 */
export async function fetchInitialPage(): Promise<SessionContext> {
  Logger.info("[Sandbox] Cargando la página inicial simulada de OEFA desde el fixture local...");
  const fixturePath = path.resolve(CONFIG.OEFA.SANDBOX_FIXTURE_PATH);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Sandbox fixture for OEFA not found at path: ${fixturePath}`);
  }
  const html = fs.readFileSync(fixturePath, "utf-8");
  const viewState = extractViewStateFromHtml(html);
  return {
    cookies: "JSESSIONID=SANDBOX_MOCK_OEFA_SESSION",
    viewState,
  };
}

/**
 * Devuelve la página de búsqueda simulada de OEFA usando el fixture local.
 */
export async function searchOefa(context: SessionContext): Promise<{ html: string; newContext: SessionContext }> {
  Logger.info("[Sandbox] Devolviendo la página de búsqueda simulada de OEFA...");
  const fixturePath = path.resolve(CONFIG.OEFA.SANDBOX_FIXTURE_PATH);
  const html = fs.readFileSync(fixturePath, "utf-8");
  return { html, newContext: context };
}

/**
 * Simula la paginación de OEFA. Retorna vacío para páginas mayores a 1 para simular fin de registros.
 */
export async function paginateOefa(
  page: number,
  context: SessionContext
): Promise<{ html: string; newContext: SessionContext }> {
  Logger.info(`[Sandbox] Simulando paginación a la página ${page} de OEFA...`);
  
  if (page > 1) {
    Logger.info("[Sandbox] Simulando fin de resultados en OEFA para páginas superiores.");
    const emptyXml = `<?xml version="1.0" encoding="utf-8"?><partial-response><changes><update id="listarDetalleInfraccionRAAForm:dt"><![CDATA[<tbody id="listarDetalleInfraccionRAAForm:dt_data" class="ui-datatable-data"><tr class="ui-widget-content ui-datatable-empty-message"><td colspan="7">No se encontraron registros.</td></tr></tbody>]]></update><update id="javax.faces.ViewState"><![CDATA[MOCK_OEFA_VIEWSTATE_EMPTY]]></update></changes></partial-response>`;
    return { html: emptyXml, newContext: { ...context, viewState: "MOCK_OEFA_VIEWSTATE_EMPTY" } };
  }
  
  const fixturePath = path.resolve(CONFIG.OEFA.SANDBOX_FIXTURE_PATH);
  const html = fs.readFileSync(fixturePath, "utf-8");
  return { html, newContext: context };
}

/**
 * Simula la descarga creando un archivo PDF de prueba simulado de OEFA.
 */
export async function downloadOefaFile(
  targetId: string,
  paramUuid: string,
  context: SessionContext
): Promise<string> {
  const targetDir = path.resolve(CONFIG.DOWNLOAD_DIR);
  ensureDirExists(targetDir);

  const outputFilePath = path.join(targetDir, `oefa_${paramUuid}.pdf`);

  Logger.info(`[Sandbox] Simulando descarga de PDF de OEFA para el UUID: ${paramUuid}...`);
  const dummyPdfContent = `%PDF-1.4\n% MOCK PDF FOR OEFA UUID: ${paramUuid}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;
  fs.writeFileSync(outputFilePath, dummyPdfContent, "utf-8");
  Logger.success(`[Sandbox] Archivo de prueba guardado en disco: oefa_${paramUuid}.pdf`);
  return outputFilePath;
}
