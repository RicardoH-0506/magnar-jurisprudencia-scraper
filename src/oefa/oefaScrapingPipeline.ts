import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../config/constants";
import { Logger } from "../utils/logger";
import {
  fetchInitialPage,
  searchOefa,
  paginateOefa,
  downloadOefaFile,
} from "./oefaClientProxy";
import { parseOefaListPage } from "./oefaDataParser";
import { SessionContext, OefaDocumento } from "../types";
import { sleep, appendToDlq } from "../utils/helpers";

/**
 * Orquestador principal del flujo del Repositorio Digital de OEFA.
 * Pagina de forma controlada y descarga los PDFs correspondientes.
 */
export async function runOefaPipeline(
  limitPages: number = CONFIG.OEFA.MAX_PAGES_TEST,
  limitDownloads: number = CONFIG.OEFA.MAX_DOCUMENTS_TEST
): Promise<void> {
  const isSandbox = process.env.OEFA_SANDBOX === "true" || process.env.NODE_ENV === "test";
  Logger.info(`=== Iniciando Pipeline de Raspado de la OEFA [Modo: ${isSandbox ? "SANDBOX" : "EN VIVO"}] ===`);
  
  const allDocuments: OefaDocumento[] = [];
  let downloadedCount = 0;
  
  try {
    // 1. Cargamos cookies y ViewState inicial de OEFA
    let context = await fetchInitialPage();
    await sleep(CONFIG.BASE_DELAY_MS);
    
    // 2. Disparamos la búsqueda inicial por AJAX
    const searchRes = await searchOefa(context);
    let html = searchRes.html;
    context = searchRes.newContext;
    await sleep(CONFIG.BASE_DELAY_MS);
    
    // 3. Iteración en las páginas configuradas
    let currentPage = 1;
    
    while (currentPage <= limitPages) {
      Logger.info(`Procesando OEFA Página ${currentPage} de ${limitPages}...`);
      
      // Parseamos los resultados de la grilla (las respuestas parciales de PrimeFaces requieren tratamiento especial)
      const isXml = currentPage > 1 || html.trim().startsWith("<?xml");
      const pageDocs = parseOefaListPage(html, isXml);
      Logger.info(`Se encontraron ${pageDocs.length} registros en la página ${currentPage}`);
      
      if (pageDocs.length === 0) {
        Logger.info("No se encontraron más registros en OEFA. Terminando paginación.");
        break;
      }
      
      for (const doc of pageDocs) {
        allDocuments.push(doc);
        
        // Si queda cupo de descargas en este lote, bajamos el PDF
        if (downloadedCount < limitDownloads) {
          if (doc.targetId === "N/D" || doc.paramUuid === "N/D") {
            Logger.warn(`Omitiendo descarga de expediente ${doc.nroExpediente} por faltar coordenadas JSF.`);
            appendToDlq("OEFA", doc, "Faltan las coordenadas de descarga (targetId / paramUuid)");
            continue;
          }
          
          try {
            await downloadOefaFile(doc.targetId, doc.paramUuid, context);
            downloadedCount++;
            await sleep(CONFIG.BASE_DELAY_MS);
          } catch (downloadErr: any) {
            Logger.error(`Error al descargar el PDF del expediente: ${doc.nroExpediente}`, downloadErr);
            appendToDlq("OEFA", doc, downloadErr.message || "Download timeout/error");
          }
        } else {
          Logger.debug(`Límite de descargas alcanzado (${limitDownloads}). Omitiendo descarga de: ${doc.nroExpediente}`);
        }
      }
      
      // Avanzamos de página si todavía nos queda por procesar
      currentPage++;
      if (currentPage <= limitPages) {
        try {
          const paginationRes = await paginateOefa(currentPage, context);
          html = paginationRes.html;
          context = paginationRes.newContext;
          await sleep(CONFIG.BASE_DELAY_MS);
        } catch (pageErr: any) {
          Logger.error(`Error al navegar a la página ${currentPage} de OEFA`, pageErr);
          // Si falla la paginación, intentamos recuperar la sesión en caliente
          Logger.warn("Intentando autorecuperación de sesión para reanudar paginación...");
          try {
            const freshContext = await fetchInitialPage();
            await sleep(CONFIG.BASE_DELAY_MS);
            const freshSearch = await searchOefa(freshContext);
            context = freshSearch.newContext;
            await sleep(CONFIG.BASE_DELAY_MS);
            // Re-fetch page pagination
            const paginationRes = await paginateOefa(currentPage, context);
            html = paginationRes.html;
            context = paginationRes.newContext;
            await sleep(CONFIG.BASE_DELAY_MS);
          } catch (recoveryErr: any) {
            Logger.error("La recuperación de sesión falló definitivamente. Abortando el loop de paginación de OEFA.", recoveryErr);
            break;
          }
        }
      }
    }
    
    // Guardamos la metadata final del scraping en formato JSON
    const metadataPath = path.resolve("./oefa.json");
    fs.writeFileSync(metadataPath, JSON.stringify(allDocuments, null, 2), "utf-8");
    Logger.success(`Scraper de OEFA finalizado. Registros indexados: ${allDocuments.length}. PDFs descargados: ${downloadedCount}.`);
    Logger.info(`Metadatos guardados en: ${metadataPath}`);
    
  } catch (err: any) {
    Logger.error("Ocurrió un error crítico durante el pipeline de raspado de la OEFA:", err);
    throw err;
  }
}
