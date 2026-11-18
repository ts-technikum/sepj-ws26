// Ablauf von POST /api/generate.
//
// 1. Anfrage prüfen.
// 2. Modell aufrufen (System-Prompt v1 + Wunsch + optionale Daten).
// 3. Antwort parsen, input prüfen und normalisieren, Code statisch prüfen.
// 4. Code in der Sandbox ausführen, Trace bauen und gegen das Schema prüfen.
// 5. Bei Fehlern aus 3 oder 4 eine Korrekturrunde mit den konkreten Meldungen.

import { LIMITS } from './limits.mjs';
import { validateInput } from './validateInput.mjs';
import { checkCode } from './checkCode.mjs';
import { readFileSync } from 'node:fs';
import { validateTrace } from '@sepj/trace-schema';
import { runInSandbox, SandboxError } from '../sandbox/sandbox.mjs';
import { SYSTEM_PROMPT, PROMPT_VERSION, buildUserMessage, buildRepairMessage } from '../llm/systemPrompt.mjs';

export const FAILURE_MESSAGE = 'Visualisierung gescheitert';

const TRACE_SCHEMA = JSON.parse(readFileSync(new URL('../../../../packages/trace-schema/trace.schema.json', import.meta.url), 'utf8'));

/** Führt den geprüften Code aus und baut den Trace. Wirft SandboxError oder GenerateError. */
export async function buildTrace(result, execute) {
  const started = Date.now();
  const { events, truncated } = await execute(result.code, result.input);
  const trace = { version: '1.0', algorithm: result.algorithm, source: result.code, events, truncated };
  const errors = validateTrace(trace, TRACE_SCHEMA);
  if (errors.length) throw new GenerateError('TRACE_INVALID', 422, errors.slice(0, 10));
  return { trace, durationMs: Date.now() - started };
}

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

export async function generate(body, { llm, execute = runInSandbox, maxAttempts = LIMITS.maxAttempts, now = Date.now } = {}) {
  const requestErrors = validateRequest(body);
  if (requestErrors.length) throw new GenerateError('INVALID_REQUEST', 400, requestErrors);

  const request = { prompt: body.prompt, data: body.data ?? '' };
  const started = now();
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  // Gründe für jede Korrekturrunde, z. B. ["Ausführung: Zeile 3: ..."]. Für die Prompt-Evaluation.
  const repairs = [];
  const meta = (attempts) => ({
    provider: llm.provider, model: llm.model, promptVersion: PROMPT_VERSION,
    attempts, durationMs: now() - started, usage: { ...usage },
    repairs: repairs.map((r) => [...r]),
  });

  const messages = [{ role: 'user', content: buildUserMessage(request) }];
  let lastErrors = [];
  let lastFailure = { code: 'GENERATION_FAILED', status: 422 };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let reply;
    try {
      reply = await llm.complete({ system: SYSTEM_PROMPT, messages, request });
    } catch (err) {
      if (err.code?.startsWith?.('LLM_')) throw new GenerateError(err.code, err.status, [err.message], meta(attempt));
      throw new GenerateError('LLM_ERROR', 502, [err.message], meta(attempt));
    }
    for (const k of Object.keys(usage)) usage[k] += reply.usage?.[k] ?? 0;

    let { result, errors } = checkModelAnswer(reply.text);
    if (result?.status === 'clarify') return { ...result, meta: meta(attempt) };
    if (result) {
      try {
        const { trace, durationMs } = await buildTrace(result, execute);
        return { ...result, trace, execution: { enabled: true, durationMs }, meta: meta(attempt) };
      } catch (err) {
        if (err instanceof SandboxError) {
          if (err.code === 'SANDBOX_INTERNAL') throw new GenerateError(err.code, err.status, [err.message], meta(attempt));
          lastFailure = { code: err.code, status: err.status };
          errors = [`Ausführung: ${err.message}`];
        } else if (err instanceof GenerateError) {
          lastFailure = { code: err.code, status: err.status };
          errors = err.details.map((d) => `Trace: ${d}`);
        } else {
          throw err;
        }
      }
    } else {
      lastFailure = { code: 'GENERATION_FAILED', status: 422 };
    }
    lastErrors = errors;
    repairs.push(errors);
    messages.push(
      { role: 'assistant', content: reply.assistantContent },
      { role: 'user', content: buildRepairMessage(errors) },
    );
  }
  throw new GenerateError(lastFailure.code, lastFailure.status, lastErrors, meta(maxAttempts));
}
