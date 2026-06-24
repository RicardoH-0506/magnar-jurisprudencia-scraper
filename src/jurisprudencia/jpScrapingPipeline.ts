import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../config/constants";
import { Logger } from "../utils/logger";
import {
  fetchInitialPage,
  searchPJ,
  paginatePJ,
  downloadPJFile,
} from "./jpClientProxy";
import { parseJpListPage } from "./jpDataParser";
import { SessionContext, JurisprudenciaDocumento } from "../types";
import { appendToDlq, sleep } from "../utils/helpers";

/**
 * Orquestador principal del flujo del Poder Judicial (PJ).
 * Maneja de forma inteligente el modo Live y el modo Sandbox (offline).
 */
export async function runJpPipeline(
  limitPages: number = CONFIG.PJ.MAX_PAGES_TEST,
  limitDownloads: number = CONFIG.PJ.MAX_DOCUMENTS_TEST
): Promise<void> {
  const isSandbox = process.env.PJ_SANDBOX === "true" || process.env.NODE_ENV === "test";
  Logger.info(`=== Iniciando Pipeline de Raspado del PJ [Modo: ${isSandbox ? "SANDBOX" : "EN VIVO"}] ===`);
  
  const allDocuments: JurisprudenciaDocumento[] = [];
  let downloadedCount = 0;
  
  try {
    // 1. Carga inicial del formulario para establecer la sesión (cookies y primer ViewState)
    let context = await fetchInitialPage();
    await sleep(CONFIG.BASE_DELAY_MS);
    
    // 2. Simula el submit del botón de buscar para levantar los datos
    const searchRes = await searchPJ(context);
    let html = searchRes.html;
    context = searchRes.newContext;
    await sleep(CONFIG.BASE_DELAY_MS);
    
    // 3. Iteración sobre las páginas del listado
    let currentPage = 1;
    
    while (currentPage <= limitPages) {
      Logger.info(`Procesando PJ Página ${currentPage} de ${limitPages}...`);
      
      // Parseamos el HTML de la página para obtener la grilla de metadatos
      const pageDocs = parseJpListPage(html);
      Logger.info(`Se encontraron ${pageDocs.length} registros en la página ${currentPage}`);
      
      if (pageDocs.length === 0) {
        Logger.info("No hay más registros en el PJ. Finalizando paginación.");
        break;
      }
      
      for (const doc of pageDocs) {
        allDocuments.push(doc);
        
        // Si aún no superamos el tope de descargas configurado, nos traemos el PDF
        if (downloadedCount < limitDownloads) {
          if (doc.targetId === "N/D" || doc.uuid === "N/D") {
            Logger.warn(`Omitiendo descarga de resolución ${doc.nroRecurso} por faltarle coordenadas JSF.`);
            appendToDlq("PJ", doc, "Faltan las coordenadas de descarga (targetId / uuid)");
            continue;
          }
          
          try {
            await downloadPJFile(doc.targetId, doc.uuid, context);
            downloadedCount++;
            await sleep(CONFIG.BASE_DELAY_MS);
          } catch (downloadErr: any) {
            Logger.error(`Error al descargar el PDF del recurso: ${doc.nroRecurso}`, downloadErr);
            appendToDlq("PJ", doc, downloadErr.message || "Download timeout/error");
          }
        } else {
          Logger.debug(`Límite de descargas alcanzado (${limitDownloads}). Omitiendo descarga de: ${doc.nroRecurso}`);
        }
      }
      
      // Solicitamos la siguiente página si corresponde
      currentPage++;
      if (currentPage <= limitPages) {
        try {
          const paginationRes = await paginatePJ(currentPage, context);
          html = paginationRes.html;
          context = paginationRes.newContext;
          await sleep(CONFIG.BASE_DELAY_MS);
        } catch (pageErr: any) {
          Logger.error(`Error al navegar a la página ${currentPage} del PJ`, pageErr);
          
          if (isSandbox) {
            Logger.warn("[Sandbox] Abortando paginación simulada después de falla controlada.");
            break;
          }
          
          // Re-inicializamos la sesión para intentar recuperar la navegación
          Logger.warn("Intentando recuperar la sesión JSF para continuar paginando...");
          try {
            const freshContext = await fetchInitialPage();
            await sleep(CONFIG.BASE_DELAY_MS);
            const freshSearch = await searchPJ(freshContext);
            context = freshSearch.newContext;
            await sleep(CONFIG.BASE_DELAY_MS);
            
            const paginationRes = await paginatePJ(currentPage, context);
            html = paginationRes.html;
            context = paginationRes.newContext;
            await sleep(CONFIG.BASE_DELAY_MS);
          } catch (recoveryErr: any) {
            Logger.error("La recuperación de sesión falló definitivamente. Abortando el loop de paginación del PJ.", recoveryErr);
            break;
          }
        }
      }
    }
    
    // Exportamos los metadatos a formato JSON estructurado en el directorio raíz
    const metadataPath = path.resolve("./jurisprudencia.json");
    fs.writeFileSync(metadataPath, JSON.stringify(allDocuments, null, 2), "utf-8");
    Logger.success(`Scraper de PJ finalizado. Registros indexados: ${allDocuments.length}. PDFs descargados: ${downloadedCount}.`);
    Logger.info(`Metadatos guardados en: ${metadataPath}`);
    
  } catch (err: any) {
    Logger.error("Ocurrió un error crítico durante el pipeline de raspado del PJ:", err);
    throw err;
  }
}
