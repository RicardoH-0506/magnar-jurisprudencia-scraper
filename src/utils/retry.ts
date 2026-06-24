import { Logger } from "./logger";

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 5,
  baseDelayMs: number = 2000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      
      const status = error.response?.status;
      const isRateLimit = status === 429;
      const isNetworkError = !error.response || error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ERR_BAD_RESPONSE";
      const isServerError = status >= 500 && status < 600;

      const shouldRetry = isRateLimit || isNetworkError || isServerError;

      if (!shouldRetry || attempt > retries) {
        Logger.error(`La operación falló definitivamente tras ${attempt} intento(s). Estado: ${status || "Sin respuesta"}. Error: ${error.message}`);
        throw error;
      }

      // Backoff exponencial: baseDelay * 2^(intento - 1) + un ruido aleatorio (jitter) de 0 a 1000ms para despistar al rate limiter
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;

      Logger.warn(
        `La operación falló (Intento ${attempt}/${retries}). Motivo: ${
          isRateLimit ? "Límite de peticiones superado (429)" : isServerError ? `Código HTTP ${status}` : error.message || "Error de red"
        }. Reintentando en ${Math.round(totalDelay)}ms...`
      );
      
      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }
  }
}
