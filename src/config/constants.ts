import { MenuAction, CmdModeConfig } from "../types";

export const CONFIG = {
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  BASE_DELAY_MS: 1500,
  PJ: {
    URL: "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/analisis-jurisprudencial.xhtml",
    SANDBOX_FIXTURE_PATH: "./fixtures/jp-sample.html",
    MAX_PAGES_TEST: 2,
    MAX_DOCUMENTS_TEST: 5,
  },
  OEFA: {
    URL: "https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml",
    SANDBOX_FIXTURE_PATH: "./fixtures/oefa-sample.html",
    MAX_PAGES_TEST: 2,
    MAX_DOCUMENTS_TEST: 5,
  },
  DOWNLOAD_DIR: "./downloads",
  DLQ_FILE: "./fallidos.json"
};

export const MENU_ACTIONS: Record<string, MenuAction> = {
  "1": { runPj: true, runOefa: false, pjSandbox: true, oefaSandbox: false },
  "2": { runPj: true, runOefa: false, pjSandbox: false, oefaSandbox: false },
  "3": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: true },
  "4": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: false },
  "5": { runPj: true, runOefa: true, pjSandbox: true, oefaSandbox: true, autoRun: true },
  "6": { runPj: true, runOefa: true, pjSandbox: false, oefaSandbox: false, autoRun: true },
};

export const CMD_MODES: Record<string, CmdModeConfig> = {
  "--pj-sandbox": { runPj: true, runOefa: false, pjSandbox: true, oefaSandbox: false },
  "--pj-live": { runPj: true, runOefa: false, pjSandbox: false, oefaSandbox: false },
  "--oefa-sandbox": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: true },
  "--oefa-live": { runPj: false, runOefa: true, pjSandbox: false, oefaSandbox: false },
  "--all-test": { runPj: true, runOefa: true, pjSandbox: true, oefaSandbox: true },
  "--all-prod": { runPj: true, runOefa: true, pjSandbox: false, oefaSandbox: false },
};

