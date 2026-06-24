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
