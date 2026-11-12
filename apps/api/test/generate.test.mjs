import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createViz } from '@sepj/visualization-api';
import { validateTrace, NODE_STATES, EDGE_STATES, HIGHLIGHT_STYLES } from '@sepj/trace-schema';
import { createApp } from '../src/app.mjs';
import { createMockAdapter } from '../src/llm/adapters/mock.mjs';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../src/llm/systemPrompt.mjs';
import { RESPONSE_SCHEMA } from '../src/llm/responseSchema.mjs';
import { checkCode, FORBIDDEN, VIZ_METHODS } from '../src/generate/checkCode.mjs';
import { validateInput } from '../src/generate/validateInput.mjs';
import { LlmError } from '../src/llm/errors.mjs';

const schema = JSON.parse(readFileSync(new URL('../../../packages/trace-schema/trace.schema.json', import.meta.url), 'utf8'));

async function withApi(options, fn) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
const generate = (base, body) => fetch(base + '/api/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

// Nur im Test: führt den geprüften Code mit der echten viz-Laufzeit aus.
// Im Backend passiert das in Sprint 4 ausschließlich in der Sandbox.
function runInTest(code, input) {
  const { viz, events } = createViz();
  new Function('input', 'viz', `"use strict";\n${code}`)(structuredClone(input), viz);
  // Über JSON, wie später zwischen Sandbox und Backend (undefined-Felder fallen weg).
  const trace = JSON.parse(JSON.stringify({ version: '1.0', events }));
  return { trace, errors: validateTrace(trace, schema) };
}

const ok = (fields = {}) => ({
  status: 'ok', algorithm: 'Test', question: '', inputSource: 'user', inputNote: '',
  input: { kind: 'array', values: [2, 1] },
  code: "const a = [...input.values];\nviz.array('a', a);\nviz.step({ explanation: 'Start' });",
  ...fields,
});

// --- Ende-zu-Ende über HTTP mit dem Mock ---------------------------------

test('Bubble Sort: übernimmt die Daten der Lehrperson und erzeugt gültigen Trace', () => withApi({}, async (base) => {
  const res = await generate(base, { prompt: 'Zeig mir Bubble Sort', data: '5, 3, 8, 1' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.deepEqual(body.input, { kind: 'array', values: [5, 3, 8, 1] });
  assert.equal(body.inputSource, 'user');
  assert.equal(body.execution.enabled, true);
  assert.equal(body.trace.version, '1.0');
  assert.equal(body.trace.source, body.code);
  assert.equal(body.trace.truncated, false);
  assert.equal(body.meta.provider, 'mock');
  assert.equal(body.meta.promptVersion, PROMPT_VERSION);
  assert.equal(body.meta.attempts, 1);

  const { trace } = body;
  assert.deepEqual(validateTrace(trace, schema), []);
  // Zeilen kommen von der Laufzeit und zeigen in den generierten Code.
  const lines = body.code.split('\n');
  for (const st of trace.events.filter((e) => e.op === 'step')) assert.match(lines[st.line - 1], /viz\.step/);
  const swaps = trace.events.filter((e) => e.op === 'swap');
  const a = [5, 3, 8, 1];
  for (const s of swaps) [a[s.i], a[s.j]] = [a[s.j], a[s.i]];
  assert.deepEqual(a, [1, 3, 5, 8]);
}));

test('Binärbaum: Werte werden als Array übernommen, Code baut einen Graphen', () => withApi({}, async (base) => {
  const body = await (await generate(base, { prompt: 'Binärbaum aufbauen', data: '8 3 10 1 6' })).json();
  assert.equal(body.status, 'ok');
  assert.deepEqual(body.input, { kind: 'array', values: [8, 3, 10, 1, 6] });
  const { trace } = body;
  assert.deepEqual(validateTrace(trace, schema), []);
  const last = trace.events.filter((e) => e.op === 'graph').at(-1);
  assert.equal(last.nodes.length, 5);
  assert.equal(last.edges.length, 4);
  // Frühere graph-Events dürfen sich durch spätere Einfügungen nicht ändern.
  assert.equal(trace.events.find((e) => e.op === 'graph').nodes.length, 0);
}));

test('Binäre Suche ohne Daten: Beispiel wird als solches gekennzeichnet', () => withApi({}, async (base) => {
  const body = await (await generate(base, { prompt: 'binäre Suche' })).json();
  assert.equal(body.inputSource, 'example');
  assert.equal(body.input.kind, 'search');
  assert.equal(body.input.sorted, true);
  assert.deepEqual(validateTrace(body.trace, schema), []);
}));

test('Unklarer Wunsch liefert eine Rückfrage statt Code', () => withApi({}, async (base) => {
  const res = await generate(base, { prompt: 'Mach was Schönes' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'clarify');
  assert.ok(body.question.length > 0);
  assert.equal(body.code, undefined);
}));

test('Ungültige Anfragen werden mit 400 abgelehnt', () => withApi({}, async (base) => {
  for (const body of [{}, { prompt: '' }, { prompt: 'x'.repeat(2001) }, { prompt: 'Sort', data: [1, 2] }]) {
    const res = await generate(base, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const json = await res.json();
    assert.equal(json.error, 'INVALID_REQUEST');
    assert.ok(json.details.length > 0);
  }
}));

// --- Korrekturrunde -------------------------------------------------------

test('Abgelehnte Antwort wird mit konkreter Meldung zurückgegeben und korrigiert', async () => {
  const seen = [];
  const llm = createMockAdapter({ script: [ok({ code: "fetch('x');\nviz.array('a', [1]);\nviz.step({});" }), ok()] });
  const complete = llm.complete;
  llm.complete = (args) => { seen.push(structuredClone(args.messages)); return complete(args); };
  await withApi({ llm }, async (base) => {
    const body = await (await generate(base, { prompt: 'Sort' })).json();
    assert.equal(body.status, 'ok');
    assert.equal(body.meta.attempts, 2);
  });
  const repair = seen[1].at(-1);
  assert.equal(repair.role, 'user');
  assert.match(repair.content, /verbotene Bezeichner fetch/);
  assert.equal(seen[1].at(-2).role, 'assistant');
});

test('Nach der letzten Korrekturrunde: 422 GENERATION_FAILED mit Details', async () => {
  const bad = ok({ input: { kind: 'baum', values: [1] } });
  await withApi({ llm: createMockAdapter({ script: [bad, bad] }) }, async (base) => {
    const res = await generate(base, { prompt: 'Sort' });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error, 'GENERATION_FAILED');
    assert.equal(body.message, 'Visualisierung gescheitert');
    assert.match(body.details[0], /Erlaubt: array, search, graph, scalar/);
    assert.equal(body.meta.attempts, 2);
  });
});

test('Kein JSON vom Modell wird wie eine Vertragsverletzung behandelt', async () => {
  await withApi({ llm: createMockAdapter({ script: ['Hier ist dein Code: ...', ok()] }) }, async (base) => {
    const body = await (await generate(base, { prompt: 'Sort' })).json();
    assert.equal(body.status, 'ok');
    assert.equal(body.meta.attempts, 2);
  });
});

test('Fehler des Anbieters werden auf HTTP-Status abgebildet', async () => {
  const cases = [
    [new LlmError('LLM_UNAVAILABLE', 'kein Schlüssel'), 503],
    [new LlmError('LLM_TIMEOUT', 'zu langsam'), 504],
    [new LlmError('LLM_REFUSED', 'abgelehnt'), 422],
    [new Error('irgendwas'), 502],
  ];
  for (const [err, status] of cases) {
    await withApi({ llm: createMockAdapter({ script: [err] }) }, async (base) => {
      const res = await generate(base, { prompt: 'Sort' });
      assert.equal(res.status, status);
      assert.equal((await res.json()).message, 'Visualisierung gescheitert');
    });
  }
});

test('Laufzeitfehler geht mit Zeilennummer in die Korrekturrunde', async () => {
  const seen = [];
  const llm = createMockAdapter({ script: [ok({ code: "viz.array('a', [1]);\nviz.step({ explanation: 'x' });\nnull.y;" }), ok()] });
  const complete = llm.complete;
  llm.complete = (args) => { seen.push(structuredClone(args.messages)); return complete(args); };
  await withApi({ llm }, async (base) => {
    const body = await (await generate(base, { prompt: 'Sort' })).json();
    assert.equal(body.status, 'ok');
    assert.equal(body.meta.attempts, 2);
  });
  assert.match(seen[1].at(-1).content, /Ausführung: Zeile 3:/);
});

test('Endlosschleife: 422 SANDBOX_TIMEOUT nach der letzten Runde', async () => {
  const loop = ok({ code: "viz.array('a', [1]);\nviz.step({});\nwhile (true) {}" });
  await withApi({ llm: createMockAdapter({ script: [loop, loop] }) }, async (base) => {
    const res = await generate(base, { prompt: 'Sort' });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error, 'SANDBOX_TIMEOUT');
    assert.equal(body.message, 'Visualisierung gescheitert');
  });
});

test('Health meldet den aktiven LLM-Adapter', () => withApi({}, async (base) => {
  const body = await (await fetch(base + '/api/health')).json();
  assert.equal(body.llmProvider, 'mock');
  assert.equal(body.llmConnected, false);
}));

// --- Einheiten ------------------------------------------------------------

test('checkCode erkennt verbotene Bezeichner, unbekannte viz-Methoden und Syntaxfehler', () => {
  assert.deepEqual(checkCode(ok().code), []);
  assert.match(checkCode("viz.array('a',[1]); viz.step({}); process.exit()").join(), /process/);
  assert.match(checkCode("viz.array('a',[1]); viz.blink('a'); viz.step({})").join(), /unbekannte viz-Methode blink/);
  assert.match(checkCode("viz.array('a',[1]); viz.step({}); for (").join(), /Syntaxfehler/);
  assert.match(checkCode("viz.step({})").join(), /mindestens eine Struktur/);
  assert.match(checkCode("viz['array']('a',[1]); viz.step({})").join(), /mit Punkt/);
  // Bezeichner als Teil eines längeren Namens sind erlaubt.
  assert.deepEqual(checkCode("const importance = 1; viz.array('a',[importance]); viz.step({})"), []);
});

test('validateInput prüft Graphen und normalisiert Skalare', () => {
  const graph = { kind: 'graph', nodes: [{ id: 'A' }, { id: 'B' }], edges: [{ id: 'e', from: 'A', to: 'C' }], directed: false, start: 'A' };
  assert.match(validateInput(graph).errors.join(), /Knoten "C" existiert nicht\. Vorhanden: A, B/);
  assert.match(validateInput({ ...graph, edges: [], start: 'Z' }).errors.join(), /input.start/);
  assert.deepEqual(validateInput({ kind: 'scalar', params: [{ name: 'n', value: 5 }] }).input, { kind: 'scalar', params: { n: 5 } });
  assert.match(validateInput({ kind: 'array', values: Array(51).fill(1) }).errors.join(), /höchstens 50/);
  assert.equal(validateInput({ kind: 'search', values: [3, 1], target: 1 }).input.sorted, false);
});

test('System-Prompt nennt das vollständige Vokabular und alle Verbote', () => {
  for (const v of [...NODE_STATES, ...EDGE_STATES, ...HIGHLIGHT_STYLES, ...FORBIDDEN]) {
    assert.ok(SYSTEM_PROMPT.includes(`\`${v}\``), v);
  }
  for (const m of VIZ_METHODS) assert.ok(SYSTEM_PROMPT.includes(`viz.${m}(`), m);
});

test('Beispielcode im System-Prompt besteht die eigene Prüfung', () => {
  const blocks = SYSTEM_PROMPT.split('code:\n').slice(1).map((b) => b.split('\n\n# ')[0].split('\n\nDie Beispiele')[0]);
  assert.equal(blocks.length, 2);
  for (const code of blocks) assert.deepEqual(checkCode(code), []);
  const bfs = { kind: 'graph', directed: false, start: 'A', nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [{ id: 'A-B', from: 'A', to: 'B' }, { id: 'A-C', from: 'A', to: 'C' }, { id: 'B-D', from: 'B', to: 'D' }, { id: 'C-D', from: 'C', to: 'D' }] };
  assert.deepEqual(runInTest(blocks[0], { kind: 'array', values: [5, 1, 4, 2] }).errors, []);
  assert.deepEqual(runInTest(blocks[1], bfs).errors, []);
});

test('Antwortschema erfüllt die Regeln der Structured Outputs', () => {
  const walk = (s, path) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false, path);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
    }
    for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) assert.ok(!(key in s), `${path}: ${key}`);
    if (s.items) walk(s.items, `${path}[]`);
    for (const v of s.anyOf ?? []) walk(v, path);
  };
  walk(RESPONSE_SCHEMA, 'answer');
});
