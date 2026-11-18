import test from 'node:test';
import assert from 'node:assert/strict';
import { runInSandbox, SandboxError } from '../src/sandbox/sandbox.mjs';

const rejectsWith = (p, code, pattern) => assert.rejects(p, (e) => {
  assert.ok(e instanceof SandboxError, String(e));
  assert.equal(e.code, code);
  if (pattern) assert.match(e.message, pattern);
  return true;
});

test('führt Code aus und setzt step.line auf die Zeile im Modellcode', async () => {
  const code = "const a = [...input.values];\nviz.array('a', a);\nviz.step({ explanation: 'Start' });\nviz.swap('a', 0, 1);\nviz.step({ explanation: 'getauscht', line: 99 });";
  const { events, truncated } = await runInSandbox(code, { kind: 'array', values: [2, 1] });
  assert.equal(truncated, false);
  const steps = events.filter((e) => e.op === 'step');
  assert.deepEqual(steps.map((s) => s.line), [3, 5]);
  assert.deepEqual(steps.map((s) => s.explanation), ['Start', 'getauscht']);
  assert.deepEqual(events[0], { op: 'array', id: 'a', values: [2, 1], prev: null, group: 0 });
});

test('Host-APIs sind in der Sandbox nicht vorhanden', async () => {
  const code = "viz.scalar('t', [typeof fetch, typeof require, typeof process, typeof setTimeout, typeof globalThis.process].join(','));\nviz.step({});";
  const { events } = await runInSandbox(code, {});
  assert.equal(events[0].value, 'undefined,undefined,undefined,undefined,undefined');
});

test('input ist eingefroren', () =>
  rejectsWith(runInSandbox("input.values.push(3);", { values: [1] }), 'SANDBOX_RUNTIME_ERROR', /Zeile 1/));

test('Laufzeitfehler nennt die Zeile im Modellcode', () =>
  rejectsWith(runInSandbox("viz.array('a', [1]);\n\nnull.x;", {}), 'SANDBOX_RUNTIME_ERROR', /^Zeile 3:/));

test('unbekannter Stil wird mit erlaubten Werten abgelehnt', () =>
  rejectsWith(runInSandbox("viz.array('a', [1]);\nviz.highlight('a', { indices: [0] }, 'blinkend');", {}), 'SANDBOX_RUNTIME_ERROR', /Erlaubt: compare/));

test('Endlosschleife wird nach dem Zeitlimit abgebrochen', async () => {
  const started = Date.now();
  await rejectsWith(runInSandbox('while (true) {}', {}, { timeoutMs: 300 }), 'SANDBOX_TIMEOUT');
  assert.ok(Date.now() - started < 3000);
});

test('Speicherfresser wird spätestens vom äußeren Timer beendet', async () => {
  const started = Date.now();
  await assert.rejects(
    runInSandbox('const x = []; while (true) x.push(new Array(1e5).fill(1));', {}, { timeoutMs: 300, graceMs: 700 }),
    (e) => ['SANDBOX_TIMEOUT', 'SANDBOX_MEMORY'].includes(e.code),
  );
  assert.ok(Date.now() - started < 4000);
});

test('Eventlimit liefert Teilergebnis mit truncated', async () => {
  const { events, truncated } = await runInSandbox("viz.array('a', [1]);\nwhile (true) viz.step({});", {}, { maxEvents: 1000 });
  assert.equal(truncated, true);
  assert.equal(events.length, 1000);
});

test('Server-Prozess und seine Umgebung sind im Modellcode nicht erreichbar', async () => {
  process.env.SANDBOX_TEST_SECRET = 'geheim';
  try {
    const { events } = await runInSandbox("viz.scalar('t', typeof process);\nviz.step({});", {});
    assert.equal(events[0].value, 'undefined');
  } finally {
    delete process.env.SANDBOX_TEST_SECRET;
  }
});
