import { SessionContext } from "../types";
import * as liveClient from "./jpLiveHttpClient";
import * as sandboxClient from "./jpMockSandboxClient";

/**
 * Indica si estamos ejecutando en Modo Sandbox (Offline).
 */
function isSandbox(): boolean {
  return process.env.PJ_SANDBOX === "true" || process.env.NODE_ENV === "test";
}

/**
 * Inicializa la sesión del Poder Judicial y obtiene el ViewState inicial.
 * Delega al cliente Sandbox o al cliente real en Vivo según corresponda.
 */
export async function fetchInitialPage(): Promise<SessionContext> {
  if (isSandbox()) {
    return sandboxClient.fetchInitialPage();
  }
  return liveClient.fetchInitialPage();
}

/**
 * Ejecuta la consulta de búsqueda en el portal del PJ.
 */
export async function searchPJ(context: SessionContext): Promise<{ html: string; newContext: SessionContext }> {
  if (isSandbox()) {
    return sandboxClient.searchPJ(context);
  }
  return liveClient.searchPJ(context);
}

/**
 * Realiza la paginación a una página específica dentro del listado del PJ.
 */
export async function paginatePJ(
  page: number,
  context: SessionContext
): Promise<{ html: string; newContext: SessionContext }> {
  if (isSandbox()) {
    return sandboxClient.paginatePJ(page, context);
  }
  return liveClient.paginatePJ(page, context);
}

/**
 * Descarga el archivo PDF de una resolución específica del PJ.
 */
export async function downloadPJFile(
  targetId: string,
  uuid: string,
  context: SessionContext
): Promise<string> {
  if (isSandbox()) {
    return sandboxClient.downloadPJFile(targetId, uuid, context);
  }
  return liveClient.downloadPJFile(targetId, uuid, context);
}
