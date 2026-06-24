export const Logger = {
  info: (msg: string) => {
    console.log(`[INFO] [${new Date().toISOString()}] ${msg}`);
  },
  success: (msg: string) => {
    console.log(`\x1b[32m[SUCCESS] [${new Date().toISOString()}] ${msg}\x1b[0m`);
  },
  warn: (msg: string) => {
    console.log(`\x1b[33m[WARN] [${new Date().toISOString()}] ${msg}\x1b[0m`);
  },
  error: (msg: string, err?: any) => {
    console.error(`\x1b[31m[ERROR] [${new Date().toISOString()}] ${msg}\x1b[0m`, err || "");
  },
  debug: (msg: string) => {
    if (process.env.DEBUG === "true") {
      console.log(`[DEBUG] [${new Date().toISOString()}] ${msg}`);
    }
  }
};
