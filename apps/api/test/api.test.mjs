import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.mjs';

async function withApi(fn) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (url, data, headers = { 'content-type': 'application/json' }) => fetch(url, { method:'POST', headers, body: typeof data === 'string' ? data : JSON.stringify(data) });

test('health zeigt tatsächliche Verfügbarkeit der Komponenten', () => withApi(async base => {
  const res = await fetch(base + '/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).llmConnected, false);
}));
test('gültiger Trace wird validiert und zusammengefasst', () => withApi(async base => {
  const res = await post(base + '/api/traces/validate', { version:'1.0', events:[{op:'array', id:'a',values:[5,2],prev:null,group:0},{op:'step',group:0,explanation:'Start'}] });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.valid, true);
  assert.equal(body.summary.eventCount, 2);
  assert.equal(body.summary.stepCount, 1);
}));
test('ungültige Traces liefern Fehlerliste', () => withApi(async base => {
  const res = await post(base + '/api/traces/validate', {version:'2.0',events:[]});
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.length > 0);
}));
test('unzulässige und fehlerhafte Eingaben werden zurückgewiesen', () => withApi(async base => {
  assert.equal((await post(base + '/api/traces/validate','{kaputt')).status,400);
  assert.equal((await post(base + '/api/traces/validate','{}',{'content-type':'text/plain'})).status,415);
  assert.equal((await fetch(base + '/api/traces/validate')).status,405);
  assert.equal((await fetch(base + '/does-not-exist')).status,404);
}));
test('LLM-Endpunkt behauptet keine nicht existierende Integration', () => withApi(async base => {
  const res = await post(base + '/api/generate', {pseudocode:'sortiere'});
  assert.equal(res.status,501);
  assert.equal((await res.json()).error,'NOT_IMPLEMENTED');
}));
test('Event-Limit verhindert zu große Trace-Verarbeitung', () => withApi(async base => {
  const events = Array.from({length:10001}, (_,i)=>({op:'step',group:i}));
  const res = await post(base + '/api/traces/validate',{version:'1.0',events});
  assert.equal(res.status,413);
}));
