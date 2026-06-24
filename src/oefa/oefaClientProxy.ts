import { SessionContext } from "../types";
import * as liveClient from "./oefaLiveHttpClient";
import * as sandboxClient from "./oefaMockSandboxClient";

/**
 * Indica si estamos ejecutando en Modo Sandbox (Offline).
 */
function isSandbox(): boolean {
  return process.env.OEFA_SANDBOX === "true" || process.env.NODE_ENV === "test";
}

/**
 * Inicializa la sesión de la OEFA y obtiene el ViewState inicial.
 * Delega al cliente Sandbox o al cliente real en Vivo según corresponda.
 */
export async function fetchInitialPage(): Promise<SessionContext> {
  if (isSandbox()) {
    return sandboxClient.fetchInitialPage();
  }
  return liveClient.fetchInitialPage();
}

/**
 * Gatilla la búsqueda inicial en el formulario de la OEFA.
 */
export async function searchOefa(context: SessionContext): Promise<{ html: string; newContext: SessionContext }> {
  if (isSandbox()) {
    return sandboxClient.searchOefa(context);
  }
  return liveClient.searchOefa(context);
}

/**
 * Petición de paginación para avanzar de página en OEFA.
 */
export async function paginateOefa(
  page: number,
  context: SessionContext
): Promise<{ html: string; newContext: SessionContext }> {
  if (isSandbox()) {
    return sandboxClient.paginateOefa(page, context);
  }
  return liveClient.paginateOefa(page, context);
}

/**
 * Descarga el PDF de OEFA.
 */
export async function downloadOefaFile(
  targetId: string,
  paramUuid: string,
  context: SessionContext
): Promise<string> {
  if (isSandbox()) {
    return sandboxClient.downloadOefaFile(targetId, paramUuid, context);
  }
  return liveClient.downloadOefaFile(targetId, paramUuid, context);
}
