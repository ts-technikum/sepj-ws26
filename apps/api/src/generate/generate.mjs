// Ablauf von POST /api/generate (Sprint 3: bis einschließlich Code-Prüfung).
//
// 1. Anfrage prüfen.
// 2. Modell aufrufen (System-Prompt v1 + Wunsch + optionale Daten).
// 3. Antwort parsen, input prüfen und normalisieren, Code statisch prüfen.
// 4. Bei Fehlern eine Korrekturrunde mit den konkreten Meldungen.
// 5. Ergebnis zurückgeben. Ausführung in der Sandbox folgt in Sprint 4,
//    bis dahin ist trace null und execution.enabled false.

import { LIMITS } from './limits.mjs';
import { validateInput } from './validateInput.mjs';
import { checkCode } from './checkCode.mjs';
import { SYSTEM_PROMPT, PROMPT_VERSION, buildUserMessage, buildRepairMessage } from '../llm/systemPrompt.mjs';

export const FAILURE_MESSAGE = 'Visualisierung gescheitert';

export class GenerateError extends Error {
  constructor(code, status, details = [], meta = undefined) {
    super(FAILURE_MESSAGE);
    this.code = code;
    this.status = status;
    this.details = details;
    this.meta = meta;
  }
}

export function validateRequest(body) {
  const errors = [];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return ['Anfrage muss ein JSON-Objekt sein'];
  const allowed = ['prompt', 'data'];
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) errors.push(`Unbekannte Felder: ${extra.join(', ')}. Erlaubt: ${allowed.join(', ')}`);
  if (typeof body.prompt !== 'string' || body.prompt.trim() === '') errors.push('prompt: muss ein nicht leerer String sein');
  else if (body.prompt.length > LIMITS.maxPromptChars) errors.push(`prompt: höchstens ${LIMITS.maxPromptChars} Zeichen`);
  if (body.data !== undefined && body.data !== null) {
    if (typeof body.data !== 'string') errors.push('data: muss ein String sein, zum Beispiel "5, 3, 8, 1"');
    else if (body.data.length > LIMITS.maxDataChars) errors.push(`data: höchstens ${LIMITS.maxDataChars} Zeichen`);
  }
  return errors;
}

/** Prüft eine einzelne Modellantwort. Rückgabe: { result } oder { errors }. */
export function checkModelAnswer(text) {
  let out;
  try { out = JSON.parse(text); }
  catch { return { errors: ['Antwort ist kein gültiges JSON'] }; }
  if (out === null || typeof out !== 'object') return { errors: ['Antwort muss ein JSON-Objekt sein'] };

  if (out.status === 'clarify') {
    if (typeof out.question !== 'string' || out.question.trim() === '') return { errors: ['question: bei status "clarify" ist eine Rückfrage nötig'] };
    return { result: { status: 'clarify', question: out.question.trim() } };
  }
  if (out.status !== 'ok') return { errors: [`status: "${out.status}" nicht erlaubt. Erlaubt: ok, clarify`] };

  const errors = [];
  if (typeof out.algorithm !== 'string' || out.algorithm.trim() === '') errors.push('algorithm: Anzeigename fehlt');
  if (!['user', 'example'].includes(out.inputSource)) errors.push(`inputSource: "${out.inputSource}" nicht erlaubt bei status "ok". Erlaubt: user, example`);
  const { input, errors: inputErrors } = validateInput(out.input);
  errors.push(...inputErrors, ...checkCode(out.code));
  if (errors.length) return { errors };

  return {
    result: {
      status: 'ok',
      algorithm: out.algorithm.trim(),
      input,
      inputSource: out.inputSource,
      inputNote: typeof out.inputNote === 'string' ? out.inputNote.trim() : '',
      code: out.code,
    },
  };
}

export async function generate(body, { llm, maxAttempts = LIMITS.maxAttempts, now = Date.now } = {}) {
  const requestErrors = validateRequest(body);
  if (requestErrors.length) throw new GenerateError('INVALID_REQUEST', 400, requestErrors);

  const request = { prompt: body.prompt, data: body.data ?? '' };
  const started = now();
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const meta = (attempts) => ({
    provider: llm.provider, model: llm.model, promptVersion: PROMPT_VERSION,
    attempts, durationMs: now() - started, usage: { ...usage },
  });

  const messages = [{ role: 'user', content: buildUserMessage(request) }];
  let lastErrors = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let reply;
    try {
      reply = await llm.complete({ system: SYSTEM_PROMPT, messages, request });
    } catch (err) {
      if (err.code?.startsWith?.('LLM_')) throw new GenerateError(err.code, err.status, [err.message], meta(attempt));
      throw new GenerateError('LLM_ERROR', 502, [err.message], meta(attempt));
    }
    for (const k of Object.keys(usage)) usage[k] += reply.usage?.[k] ?? 0;

    const { result, errors } = checkModelAnswer(reply.text);
    if (result) {
      if (result.status === 'clarify') return { ...result, meta: meta(attempt) };
      return {
        ...result,
        trace: null,
        execution: { enabled: false, reason: 'Die Sandbox folgt in Sprint 4.' },
        meta: meta(attempt),
      };
    }
    lastErrors = errors;
    messages.push(
      { role: 'assistant', content: reply.assistantContent },
      { role: 'user', content: buildRepairMessage(errors) },
    );
  }
  throw new GenerateError('GENERATION_FAILED', 422, lastErrors, meta(maxAttempts));
}
