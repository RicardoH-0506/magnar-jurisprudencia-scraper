import * as readline from "readline";
import { runScrapers } from "./orchestrator";

// Helper para hacer preguntas en la terminal de forma interactiva
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function showHelp() {
  console.log(`
Uso: npm start [opciones]

Opciones:
  --pj-sandbox       Ejecuta el scraper del Poder Judicial (PJ) en modo SANDBOX (usa archivos locales)
  --pj-live          Ejecuta el scraper del Poder Judicial (PJ) en modo EN VIVO (requiere IP/VPN de Perú)
  --oefa-sandbox     Ejecuta el scraper de la OEFA en modo SANDBOX (usa archivos locales)
  --oefa-live        Ejecuta el scraper de la OEFA en modo EN VIVO
  --all-test         Ejecuta ambos scrapers en modo prueba (PJ Sandbox + OEFA Sandbox con límites bajos)
  --all-prod         Ejecuta ambos scrapers en modo producción (PJ Live + OEFA Live con límites altos)
  -p, --pages <num>  Cantidad máxima de páginas a recorrer (opcional)
  -d, --docs <num>   Cantidad máxima de documentos/PDFs a descargar (opcional)
  -h, --help         Muestra este menú de ayuda

Si no se especifica ninguna opción de modo por consola, se levantará un menú interactivo automáticamente.
`);
}

interface MenuAction {
  runPj: boolean;
  runOefa: boolean;
  pjSandbox: boolean;
  oefaSandbox: boolean;
  autoRun?: boolean;
}

const MENU_ACTIONS: Record<string, MenuAction> = {
  "1": { runPj: true, runOefa: false, pjSandbox: true, oefaSandbox: false },
  "2": { runPj: true, runOefa: false, pjSandbox: false, oefaSandbox: false },
  "3": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: true },
  "4": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: false },
  "5": { runPj: true, runOefa: true, pjSandbox: true, oefaSandbox: true, autoRun: true },
  "6": { runPj: true, runOefa: true, pjSandbox: false, oefaSandbox: false, autoRun: true },
};

async function interactiveMenu() {
  console.log(`
==================================================
   MENÚ DE EJECUCIÓN - SCRAPER DE ALTA RESILIENCIA
==================================================
Selecciona una opción para ejecutar:
1) Scraper del Poder Judicial (PJ) - Modo SANDBOX (usa archivos locales offline)
2) Scraper del Poder Judicial (PJ) - Modo EN VIVO (requiere IP o VPN de Perú)
3) Scraper de la OEFA - Modo SANDBOX (usa archivos locales offline)
4) Scraper de la OEFA - Modo EN VIVO (conexión en tiempo real sin geobloqueo)
5) EJECUTAR AMBOS - Configuración de PRUEBA (PJ en Sandbox + OEFA en Sandbox, límite: 2 pág / 5 docs)
6) EJECUTAR AMBOS - Configuración de PRODUCCIÓN (PJ en vivo + OEFA en vivo, límite: 10 pág / 50 docs)
7) Salir
`);

  const option = await askQuestion("Elige una opción (1-7): ");

  if (option === "7" || !option) {
    console.log("Cerrando el programa.");
    process.exit(0);
  }

  const action = MENU_ACTIONS[option];
  if (!action) {
    console.log("Opción no válida. Saliendo del programa.");
    process.exit(1);
  }

  const { runPj, runOefa, pjSandbox, oefaSandbox } = action;

  if (action.autoRun) {
    await runScrapers({ runPj, runOefa, pjSandbox, oefaSandbox });
    return;
  }

  let pages: number | undefined = undefined;
  let docs: number | undefined = undefined;

  // Preguntamos por límites personalizados si corre un solo scraper
  const customLimits = await askQuestion("¿Quieres ingresar límites de descarga personalizados? (s/n, por defecto n): ");
  if (customLimits.toLowerCase() === "s" || customLimits.toLowerCase() === "si" || customLimits.toLowerCase() === "sí") {
    const pagesStr = await askQuestion(`Límite máximo de páginas a recorrer (por defecto 2): `);
    const docsStr = await askQuestion(`Límite máximo de archivos a descargar (por defecto 5): `);
    
    if (pagesStr) {
      const parsedPages = parseInt(pagesStr, 10);
      if (!isNaN(parsedPages) && parsedPages > 0) pages = parsedPages;
    }
    if (docsStr) {
      const parsedDocs = parseInt(docsStr, 10);
      if (!isNaN(parsedDocs) && parsedDocs >= 0) docs = parsedDocs;
    }
  }

  await runScrapers({ runPj, runOefa, pjSandbox, oefaSandbox, pages, docs });
}

interface CmdModeConfig {
  runPj: boolean;
  runOefa: boolean;
  pjSandbox: boolean;
  oefaSandbox: boolean;
}

const CMD_MODES: Record<string, CmdModeConfig> = {
  "--pj-sandbox": { runPj: true, runOefa: false, pjSandbox: true, oefaSandbox: false },
  "--pj-live": { runPj: true, runOefa: false, pjSandbox: false, oefaSandbox: false },
  "--oefa-sandbox": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: true },
  "--oefa-live": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: false },
  "--all-test": { runPj: true, runOefa: true, pjSandbox: true, oefaSandbox: true },
  "--all-prod": { runPj: true, runOefa: true, pjSandbox: false, oefaSandbox: false },
};

/**
 * Función principal para iniciar la interfaz de línea de comandos (CLI) o el menú interactivo.
 */
export async function startCli(): Promise<void> {
  const args = process.argv.slice(2);

  // Flag de ayuda
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  // Procesamos los argumentos de línea de comandos
  let runPj = false;
  let runOefa = false;
  let pjSandbox = false;
  let oefaSandbox = false;
  let pages: number | undefined = undefined;
  let docs: number | undefined = undefined;
  let hasModeArg = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg in CMD_MODES) {
      const mode = CMD_MODES[arg];
      runPj = mode.runPj;
      runOefa = mode.runOefa;
      pjSandbox = mode.pjSandbox;
      oefaSandbox = mode.oefaSandbox;
      hasModeArg = true;
    } else if (arg === "--pages" || arg === "-p") {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val) && val > 0) {
        pages = val;
        i++;
      }
    } else if (arg === "--docs" || arg === "-d") {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val) && val >= 0) {
        docs = val;
        i++;
      }
    }
  }

  if (hasModeArg) {
    await runScrapers({ runPj, runOefa, pjSandbox, oefaSandbox, pages, docs });
  } else {
    // Si no pasaron flags de modo, levantamos el menú interactivo
    await interactiveMenu();
  }
}
