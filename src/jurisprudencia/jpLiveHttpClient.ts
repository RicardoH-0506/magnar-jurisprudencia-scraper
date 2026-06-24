import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../config/constants";
import { Logger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import { extractViewStateFromHtml } from "./jpDataParser";
import { postForm } from "../utils/http";
import { SessionContext } from "../types";
import { ensureDirExists } from "../utils/helpers";

/**
 * Inicializa la sesión del Poder Judicial y obtiene el ViewState inicial en vivo.
 */
export async function fetchInitialPage(): Promise<SessionContext> {
  return withRetry(async () => {
    Logger.info("Realizando petición GET inicial al portal en vivo del Poder Judicial...");
    const res = await axios.get(CONFIG.PJ.URL, {
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
      },
    });

    const setCookies = res.headers["set-cookie"] || [];
    const cookies = setCookies.map((c) => c.split(";")[0]).join("; ");
    const viewState = extractViewStateFromHtml(res.data);

    if (!viewState) {
      throw new Error("No se ha podido extraer el ViewState inicial de la página del PJ.");
    }

    Logger.success("Sesión del Poder Judicial inicializada correctamente.");
    return { cookies, viewState };
  });
}

/**
 * Ejecuta la consulta de búsqueda en el portal real del PJ.
 */
export async function searchPJ(context: SessionContext): Promise<{ html: string; newContext: SessionContext }> {
  return withRetry(async () => {
    Logger.info("Disparando la búsqueda de jurisprudencia en el portal real del PJ...");
    const payload = {
      "formBoletin": "formBoletin",
      "formBoletin:txtTitulo": "",
      "formBoletin:buTipPublicacion": "0",
      "formBoletin:buEspecialidad": "0",
      "javax.faces.ViewState": context.viewState,
      "formBoletin:j_idt33.x": "45",
      "formBoletin:j_idt33.y": "15",
    };

    const res = await postForm(CONFIG.PJ.URL, payload, context.cookies);

    const newViewState = extractViewStateFromHtml(res.data);
    if (!newViewState) {
      throw new Error("No se ha podido extraer el ViewState de la página del PJ después de realizar la búsqueda.");
    }

    const updatedContext: SessionContext = {
      ...context,
      viewState: newViewState,
    };

    return { html: res.data, newContext: updatedContext };
  });
}

/**
 * Realiza la paginación real a una página específica dentro del listado del PJ.
 */
export async function paginatePJ(
  page: number,
  context: SessionContext
): Promise<{ html: string; newContext: SessionContext }> {
  return withRetry(async () => {
    Logger.info(`Paginando en vivo al listado del PJ, página ${page}...`);
    const payload = {
      "formBoletin": "formBoletin",
      "formBoletin:txtTitulo": "",
      "formBoletin:buTipPublicacion": "0",
      "formBoletin:buEspecialidad": "0",
      "javax.faces.ViewState": context.viewState,
      "javax.faces.source": "formBoletin:data1",
      "javax.faces.partial.event": "rich:datascroller:onscroll",
      "javax.faces.partial.execute": "formBoletin:data1 @component",
      "javax.faces.partial.render": "@component",
      "org.richfaces.ajax.component": "formBoletin:data1",
      "formBoletin:data1": "formBoletin:data1",
      "formBoletin:data1:page": page.toString(),
      "AJAX:EVENTS_COUNT": "1",
      "javax.faces.partial.ajax": "true",
    };

    const res = await postForm(CONFIG.PJ.URL, payload, context.cookies);

    const newViewState = extractViewStateFromHtml(res.data);
    if (!newViewState) {
      throw new Error(`No se ha podido extraer el ViewState de la página del PJ después de paginar a la página ${page}.`);
    }

    const updatedContext: SessionContext = {
      ...context,
      viewState: newViewState,
    };

    return { html: res.data, newContext: updatedContext };
  });
}

/**
 * Descarga el archivo PDF de una resolución específica en vivo del PJ.
 */
export async function downloadPJFile(
  targetId: string,
  uuid: string,
  context: SessionContext
): Promise<string> {
  const targetDir = path.resolve(CONFIG.DOWNLOAD_DIR);
  ensureDirExists(targetDir);

  const outputFilePath = path.join(targetDir, `pj_${uuid}.pdf`);

  return withRetry(async () => {
    Logger.info(`Descargando resolución en vivo del PJ con UUID: ${uuid}...`);
    const payload = {
      "formBoletin": "formBoletin",
      "formBoletin:txtTitulo": "",
      "formBoletin:buTipPublicacion": "0",
      "formBoletin:buEspecialidad": "0",
      "javax.faces.ViewState": context.viewState,
      [targetId]: targetId,
      "uuid": uuid,
    };

    const res = await postForm(CONFIG.PJ.URL, payload, context.cookies, { responseType: "stream" });

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

    Logger.success(`Archivo guardado correctamente en disco: pj_${uuid}.pdf`);
    return outputFilePath;
  });
}
