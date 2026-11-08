import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../src/generate/generate.mjs';
import { createMockAdapter } from '../src/llm/adapters/mock.mjs';
import { evaluateCase, replay, checkResult } from '../eval/evaluate.mjs';

const { cases } = JSON.parse(readFileSync(new URL('../eval/cases.json', import.meta.url), 'utf8'));
const byId = (id) => cases.find((c) => c.id === id);
const run = (c) => generate({ prompt: c.prompt, ...(c.data !== undefined ? { data: c.data } : {}) }, { llm: createMockAdapter() });

test('cases.json: eindeutige ids, jede Erwartung hat status', () => {
  const ids = cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of cases) assert.ok(Array.isArray(c.expect.status) && c.expect.status.length > 0, c.id);
});

test('Bubble Sort vom Mock besteht alle Prüfungen inklusive sortiertem Endzustand', async () => {
  const result = await run(byId('bubble-user'));
  const { checks, pass } = evaluateCase(byId('bubble-user'), result);
  assert.equal(pass, true, JSON.stringify(checks));
  assert.equal(checks.result, true);
});

test('falsch übernommene Daten werden erkannt', async () => {
  const c = byId('bubble-user');
  const result = await run(c);
  const wrong = { ...result, input: { ...result.input, values: [1, 3, 5, 8] } };
  const { checks, pass } = evaluateCase(c, wrong);
  assert.equal(pass, false);
  assert.equal(checks.values, false);
});

test('Binärbaum vom Mock hat am Ende 5 Knoten', async () => {
  const c = byId('bst-user');
  const { pass, checks } = evaluateCase(c, await run(c));
  assert.equal(pass, true, JSON.stringify(checks));
});

test('Rückfrage statt Code: Negativfall besteht, Positivfall nicht', () => {
  const clarify = { status: 'clarify', question: 'Was genau?' };
  assert.equal(evaluateCase(byId('neg-vague'), clarify).pass, true);
  assert.equal(evaluateCase(byId('bfs-user'), clarify).pass, false);
});

test('replay: swap und set ergeben den Endzustand', () => {
  const s = replay([
    { op: 'array', id: 'a', values: [3, 1, 2] },
    { op: 'swap', id: 'a', i: 0, j: 1 },
    { op: 'set', id: 'a', index: 2, value: 9 },
    { op: 'scalar', id: 'x', value: 1 },
    { op: 'setScalar', id: 'x', value: 120 },
  ]);
  assert.deepEqual(s.arrays.get('a'), [1, 3, 9]);
  assert.equal(s.scalars.get('x'), 120);
});

test('allVisited: alle erreichbaren Knoten müssen visited sein', () => {
  const input = { kind: 'graph', nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], edges: [{ id: 'e1', from: 'A', to: 'B' }], directed: false, start: 'A' };
  const events = [
    { op: 'graph', id: 'g', nodes: input.nodes, edges: input.edges },
    { op: 'nodeState', id: 'g', nodeId: 'A', state: 'visited' },
  ];
  assert.equal(checkResult({ type: 'allVisited' }, { input, trace: { events } }), false);
  events.push({ op: 'nodeState', id: 'g', nodeId: 'B', state: 'visited' });
  assert.equal(checkResult({ type: 'allVisited' }, { input, trace: { events } }), true);
});
