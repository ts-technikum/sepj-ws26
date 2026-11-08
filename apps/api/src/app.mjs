import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { validateTrace } from '@sepj/trace-schema';
import { createMockAdapter } from './llm/adapters/mock.mjs';
import { generate, GenerateError, FAILURE_MESSAGE } from './generate/generate.mjs';

const schema = JSON.parse(readFileSync(new URL('../../../packages/trace-schema/trace.schema.json', import.meta.url), 'utf8'));
const MAX_BYTES = 1_048_576;
const MAX_EVENTS = 10_000;

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

async function readJSON(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const err = new Error('Content-Type muss application/json sein'); err.status = 415; throw err;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      const err = new Error('JSON-Anfrage ist zu groß (maximal 1 MiB)'); err.status = 413; throw err;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const err = new Error('Ungültiges JSON'); err.status = 400; throw err; }
}

// llm: Adapter aus ./llm (siehe createLlmFromEnv). Ohne Angabe läuft der Mock.
export function createApp({ llm = createMockAdapter() } = {}) {
  return createServer(async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    try {
      if (req.method === 'GET' && path === '/api/health') {
        return reply(res, 200, { status: 'ok', service: 'sepj-api', traceVersion: '1.0', llmConnected: llm.provider !== 'mock', llmProvider: llm.provider, llmModel: llm.model, executionEnabled: false });
      }
      if (req.method === 'POST' && path === '/api/traces/validate') {
        const trace = await readJSON(req);
        if (Array.isArray(trace?.events) && trace.events.length > MAX_EVENTS) {
          return reply(res, 413, { valid: false, errors: [`Zu viele Events (maximal ${MAX_EVENTS})`] });
        }
        const errors = validateTrace(trace, schema);
        return reply(res, errors.length ? 422 : 200, {
          valid: errors.length === 0,
          errors,
          ...(errors.length === 0 ? { summary: { eventCount: trace.events.length, stepCount: new Set(trace.events.map(e => e.group)).size, traceVersion: trace.version } } : {})
        });
      }
      if (req.method === 'POST' && path === '/api/generate') {
        const body = await readJSON(req);
        try {
          return reply(res, 200, await generate(body, { llm }));
        } catch (error) {
          if (!(error instanceof GenerateError)) throw error;
          return reply(res, error.status, { error: error.code, message: FAILURE_MESSAGE, details: error.details, ...(error.meta ? { meta: error.meta } : {}) });
        }
      }
      if (['/api/health', '/api/traces/validate', '/api/generate'].includes(path)) {
        res.setHeader('Allow', path === '/api/health' ? 'GET' : 'POST');
        return reply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      }
      reply(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      reply(res, error.status || 500, { error: error.status ? 'INVALID_REQUEST' : 'INTERNAL_ERROR', message: error.status ? error.message : 'Interner Serverfehler' });
    }
  });
}
