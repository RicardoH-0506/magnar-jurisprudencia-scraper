import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../config/constants";
import { Logger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import { extractViewStateFromHtml, extractViewStateFromXml } from "./oefaDataParser";
import { postForm } from "../utils/http";
import { SessionContext } from "../types";
import { ensureDirExists } from "../utils/helpers";

/**
 * Realiza la petición GET inicial en vivo para establecer las cookies y capturar el ViewState inicial de OEFA.
 */
export async function fetchInitialPage(): Promise<SessionContext> {
  return withRetry(async () => {
    Logger.info("Realizando petición GET inicial al portal de la OEFA...");
    const res = await axios.get(CONFIG.OEFA.URL, {
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
      },
    });

    const setCookies = res.headers["set-cookie"] || [];
    const cookies = setCookies.map((c) => c.split(";")[0]).join("; ");
    const viewState = extractViewStateFromHtml(res.data);

    if (!viewState) {
      throw new Error("Unable to extract initial ViewState from OEFA page.");
    }

    Logger.success("Sesión de la OEFA inicializada correctamente.");
    Logger.debug(`Longitud del ViewState de OEFA obtenido: ${viewState.length} caracteres`);
    return { cookies, viewState };
  });
}

/**
 * Gatilla la búsqueda inicial en el formulario de la OEFA mediante una petición AJAX en vivo.
 */
export async function searchOefa(context: SessionContext): Promise<{ html: string; newContext: SessionContext }> {
  return withRetry(async () => {
    Logger.info("Lanzando la búsqueda inicial por AJAX en la OEFA...");
    const payload = {
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": "listarDetalleInfraccionRAAForm:btnBuscar",
      "javax.faces.partial.execute": "@all",
      "javax.faces.partial.render": "listarDetalleInfraccionRAAForm:pgLista",
      "listarDetalleInfraccionRAAForm:btnBuscar": "listarDetalleInfraccionRAAForm:btnBuscar",
      "listarDetalleInfraccionRAAForm": "listarDetalleInfraccionRAAForm",
      "listarDetalleInfraccionRAAForm:txtNroexp": "",
      "javax.faces.ViewState": context.viewState,
    };

    const res = await postForm(CONFIG.OEFA.URL, payload, context.cookies, { isAjax: true });

    const newViewState = extractViewStateFromXml(res.data);
    if (!newViewState) {
      throw new Error("Unable to extract new ViewState after OEFA search.");
    }

    const updatedContext: SessionContext = {
      ...context,
      viewState: newViewState,
    };

    return { html: res.data, newContext: updatedContext };
  });
}

/**
 * Petición de paginación real para avanzar de página usando PrimeFaces.
 */
export async function paginateOefa(
  page: number,
  context: SessionContext
): Promise<{ html: string; newContext: SessionContext }> {
  return withRetry(async () => {
    Logger.info(`Paginando al listado de la OEFA, página ${page}...`);
    const firstRow = (page - 1) * 10;

    const payload = {
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
      "javax.faces.ViewState": context.viewState,
    };

    const res = await postForm(CONFIG.OEFA.URL, payload, context.cookies, { isAjax: true });

    const newViewState = extractViewStateFromXml(res.data);
    if (!newViewState) {
      throw new Error(`Unable to extract new ViewState after OEFA pagination to page ${page}.`);
    }

    const updatedContext: SessionContext = {
      ...context,
      viewState: newViewState,
    };

    return { html: res.data, newContext: updatedContext };
  });
}

/**
 * Descarga el PDF real de OEFA en formato stream de datos.
 */
export async function downloadOefaFile(
  targetId: string,
  paramUuid: string,
  context: SessionContext
): Promise<string> {
  return withRetry(async () => {
    Logger.info(`Descargando documento de la OEFA con UUID: ${paramUuid}...`);
    const payload = {
      "listarDetalleInfraccionRAAForm": "listarDetalleInfraccionRAAForm",
      "listarDetalleInfraccionRAAForm:txtNroexp": "",
      "listarDetalleInfraccionRAAForm:dt_scrollState": "0,0",
      [targetId]: targetId,
      "param_uuid": paramUuid,
      "javax.faces.ViewState": context.viewState,
    };

    const targetDir = path.resolve(CONFIG.DOWNLOAD_DIR);
    ensureDirExists(targetDir);

    const outputFilePath = path.join(targetDir, `oefa_${paramUuid}.pdf`);

    const res = await postForm(CONFIG.OEFA.URL, payload, context.cookies, { responseType: "stream" });

    const contentType = String(res.headers["content-type"] || "");
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      const chunks: any[] = [];
      await new Promise((resolve, reject) => {
        res.data.on("data", (chunk: any) => chunks.push(chunk));
        res.data.on("end", resolve);
        res.data.on("error", reject);
      });
      const dataStr = Buffer.concat(chunks).toString();
      throw new Error(`PDF No existe ${contentType}. Content: ${dataStr.substring(0, 500)}`);
    }

    const writer = fs.createWriteStream(outputFilePath);
    res.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    Logger.success(`Archivo guardado correctamente en disco: oefa_${paramUuid}.pdf`);
    return outputFilePath;
  });
}
