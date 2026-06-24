import * as cheerio from "cheerio";
import { Logger } from "../utils/logger";

import { OefaDocumento } from "../types";
import { generateUuid, cleanText } from "../utils/helpers";

/**
 * Extrae el token javax.faces.ViewState desde el HTML inicial de OEFA.
 */
export function extractViewStateFromHtml(html: string): string {
  const $ = cheerio.load(html);
  const viewState = $('input[name="javax.faces.ViewState"]').attr("value") || 
                    $('[id*="ViewState"]').val() || 
                    "";
  return typeof viewState === "string" ? viewState : "";
}

/**
 * Extrae el token javax.faces.ViewState desde la respuesta parcial XML de PrimeFaces.
 */
export function extractViewStateFromXml(xml: string): string {
  // Expresión regular para capturar la etiqueta de actualización del ViewState dentro del CDATA XML de PrimeFaces
  const match = xml.match(/<update id="[^"]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return "";
}

/**
 * Parsea las filas de la tabla de un fragmento HTML o XML de OEFA y las mapea al formato OefaDocumento.
 */
export function parseOefaListPage(content: string, isXml: boolean = false): OefaDocumento[] {
  let html = content;
  
  if (isXml) {
    // En las peticiones AJAX de PrimeFaces, los datos vienen envueltos en un CDATA XML; aquí extraemos ese bloque de HTML
    const updateMatch = content.match(/<update id="listarDetalleInfraccionRAAForm:(pgLista|dt)"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/);
    if (!updateMatch) {
      Logger.warn("No se encontró la etiqueta de actualización 'pgLista' o 'dt' en la respuesta XML de PrimeFaces.");
      return [];
    }
    html = updateMatch[2];
  }

  // Si el HTML parcial contiene filas tr pero no la etiqueta table, las envolvemos
  // para evitar que el parser de Cheerio las descarte por ser etiquetas huérfanas inválidas.
  if (!html.includes("<table") && html.includes("<tr")) {
    html = `<table><tbody>${html}</tbody></table>`;
  }

  const $ = cheerio.load(html);
  let rows = $('tbody[id="listarDetalleInfraccionRAAForm:dt_data"] tr, tbody[id*="dt_data"] tr');
  if (rows.length === 0) {
    rows = $('tr');
  }
  
  const documents: OefaDocumento[] = [];
  
  rows.each((_, row) => {
    const $row = $(row);
    
    // Omitimos filas que correspondan al mensaje de tabla vacía de PrimeFaces
    if ($row.hasClass("ui-datatable-empty-message")) {
      return;
    }
    
    const cells = $row.find("td");
    if (cells.length < 7) {
      return;
    }
    
    const nro = cleanText($(cells[0]).text());
    const nroExpediente = cleanText($(cells[1]).text());
    const administrado = cleanText($(cells[2]).text());
    const unidadFiscalizable = cleanText($(cells[3]).text());
    const sector = cleanText($(cells[4]).text());
    const nroResolucionApelacion = cleanText($(cells[5]).text());
    
    const $link = $(cells[6]).find("a");
    const onclickAttr = $link.attr("onclick") || "";
    
    // Extraemos el targetId y el paramUuid de la llamada onclick de Mojarra
    // Ejemplo: mojarra.jsfcljs(..., {'listarDetalleInfraccionRAAForm:dt:0:j_idt63':'...', 'param_uuid':'...'})
    const targetIdMatch = onclickAttr.match(/'(listarDetalleInfraccionRAAForm:dt:\d+:j_idt\d+)'/);
    const paramUuidMatch = onclickAttr.match(/'param_uuid'\s*:\s*'([^']+)'/);
    
    const targetId = targetIdMatch ? targetIdMatch[1] : "N/D";
    const paramUuid = paramUuidMatch ? paramUuidMatch[1] : "N/D";
    
    // Create random UUID v4 as mock id
    const id = generateUuid();
    
    documents.push({
      id,
      nro,
      nroExpediente,
      administrado,
      unidadFiscalizable,
      sector,
      nroResolucionApelacion,
      targetId,
      paramUuid
    });
  });
  
  return documents;
}
