export interface SessionContext {
  cookies: string;
  viewState: string;
}

export interface DlqEntry {
  timestamp: string;
  source: "OEFA" | "PJ";
  record: any;
  error: string;
}

export interface ScraperOptions {
  runPj: boolean;
  runOefa: boolean;
  pjSandbox: boolean;
  oefaSandbox: boolean;
  pages?: number;
  docs?: number;
}
