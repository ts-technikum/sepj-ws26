// Fehler der LLM-Anbindung. code bestimmt den HTTP-Status von /api/generate.
export const LLM_ERROR_STATUS = Object.freeze({
  LLM_UNAVAILABLE: 503,   // kein Schlüssel, Anmeldung abgelehnt, Kontingent erschöpft
  LLM_RATE_LIMITED: 503,  // zu viele Anfragen, später erneut versuchen
  LLM_TIMEOUT: 504,
  LLM_REFUSED: 422,       // Sicherheitsfilter des Modells hat abgelehnt
  LLM_TRUNCATED: 502,     // Antwort an max_tokens abgeschnitten
  LLM_ERROR: 502,         // sonstiger Fehler beim Anbieter
});

export class LlmError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, { cause });
    this.code = code;
    this.status = LLM_ERROR_STATUS[code] ?? 502;
  }
}
