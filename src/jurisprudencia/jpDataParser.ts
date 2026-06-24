import * as cheerio from "cheerio";

import { JurisprudenciaDocumento } from "../types";
import { generateUuid, cleanText } from "../utils/helpers";

/**
 * Extrae el token javax.faces.ViewState del HTML del Poder Judicial.
 */
export function extractViewStateFromHtml(html: string): string {
  const $ = cheerio.load(html);
  const viewState = $('input[name="javax.faces.ViewState"]').attr("value") || 
                    $('[id*="ViewState"]').val() || 
                    "";
  return typeof viewState === "string" ? viewState : "";
}

/**
 * Parsea las filas de la tabla a partir de un fragmento HTML del PJ y las mapea al formato JurisprudenciaDocumento.
 */
export function parseJpListPage(html: string): JurisprudenciaDocumento[] {
  const $ = cheerio.load(html);
  const rows = $('table[id*="data1"] tbody tr.rf-dt-r, tr.rf-dt-r, table.rf-dt tbody tr');
  
  const documents: JurisprudenciaDocumento[] = [];
  
  rows.each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    
    let titulo = "N/D";
    let tipoPublicacion = "N/D";
    let especialidad = "N/D";
    let nroRecurso = "N/D";
    let sala = "N/D";
    let fechaResolucion = "N/D";
    let targetId = "N/D";
    let uuid = "N/D";

    if (cells.length >= 8) {
      // Estructura original / Sandbox
      titulo = cleanText($(cells[1]).text());
      tipoPublicacion = cleanText($(cells[2]).text());
      especialidad = cleanText($(cells[3]).text());
      nroRecurso = cleanText($(cells[4]).text());
      sala = cleanText($(cells[5]).text());
      fechaResolucion = cleanText($(cells[6]).text());

      const $link = $(cells[7]).find("a");
      const onclickAttr = $link.attr("onclick") || "";
      const targetIdMatch = onclickAttr.match(/'(formBoletin:repeat:\d+:gridParticipante:\d+:j_idt\d+)'/) || onclickAttr.match(/'(formBoletin:[^']+)'/);
      const uuidMatch = onclickAttr.match(/'uuid'\s*:\s*'([^']+)'/);
      
      targetId = targetIdMatch ? targetIdMatch[1] : "N/D";
      uuid = uuidMatch ? uuidMatch[1] : "N/D";
    } else if (cells.length >= 4) {
      // Nueva estructura / Portal en Vivo
      nroRecurso = cleanText($(cells[0]).text());
      sala = cleanText($(cells[1]).text());
      fechaResolucion = cleanText($(cells[2]).text());
      titulo = `Resolución ${nroRecurso}`;

      // Buscamos dinámicamente cualquier elemento con onclick que contenga mojarra/uuid
      let onclickAttr = "";
      $row.find("input, a").each((_, el) => {
        const onclick = $(el).attr("onclick") || "";
        if (onclick.includes("mojarra") && onclick.includes("uuid")) {
          onclickAttr = onclick;
        }
      });

      const targetIdMatch = onclickAttr.match(/'(formBoletin:repeat:\d+:gridParticipante:\d+:j_idt\d+)'/) || onclickAttr.match(/'(formBoletin:[^']+)'/);
      const uuidMatch = onclickAttr.match(/'uuid'\s*:\s*'([^']+)'/);
      
      targetId = targetIdMatch ? targetIdMatch[1] : "N/D";
      uuid = uuidMatch ? uuidMatch[1] : "N/D";

      // Buscamos el título y especialidad del panel correspondiente en el repeater (dentro de formBoletin:panel)
      const $table = $row.closest("table");
      const tableId = $table.attr("id") || "";
      const indexMatch = tableId.match(/formBoletin:repeat:(\d+):/);
      if (indexMatch) {
        const index = indexMatch[1];
        let titleText = "";
        let specialtyText = "";

        const $block = $(`[id^="formBoletin:repeat:${index}:"]`);
        
        // 1. Buscamos el título (span de color rojo #CF0000)
        const titleSpan = $block.find("span").filter((_, el) => {
          const style = $(el).attr("style") || "";
          return style.includes("color:#CF0000") || style.includes("color: #CF0000");
        });
        titleText = titleSpan.text().trim().replace(/^["'\s]+|["'\s]+$/g, "");

        // 2. Buscamos la especialidad (siguiente hermano span del span con texto "Especialidad:")
        const specialtyLabel = $block.find("span").filter((_, el) => {
          return $(el).text().includes("Especialidad");
        });
        if (specialtyLabel.length > 0) {
          specialtyText = specialtyLabel.next("span").text().trim().replace(/^["'\s]+|["'\s]+$/g, "");
        }

        if (titleText) {
          titulo = titleText;
          if (titulo.toLowerCase().includes("análisis jurisprudencial")) {
            tipoPublicacion = "Análisis Jurisprudencial";
          } else if (titulo.toLowerCase().includes("boletín")) {
            tipoPublicacion = "Boletín";
          }
        }
        if (specialtyText) {
          especialidad = specialtyText;
        }
      }
    } else {
      // Fila inválida
      return;
    }

    // Generamos un UUID v4 de mentira como id local del documento
    const id = generateUuid();
    
    documents.push({
      id,
      titulo,
      tipoPublicacion,
      especialidad,
      nroRecurso,
      sala,
      fechaResolucion,
      targetId,
      uuid
    });
  });
  
  return documents;
}
