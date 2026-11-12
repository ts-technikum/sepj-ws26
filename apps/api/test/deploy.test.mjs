import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.mjs';
import { createStaticHandler } from '../src/static.mjs';
import { createRateLimiter } from '../src/rateLimit.mjs';

async function withApi(options, fn) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
const generate = (base, headers = {}) => fetch(base + '/api/generate', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ prompt: 'Mach was Schönes' }),
});

test('Limiter: pro IP und Minute, danach neue Minute frei', () => {
  let t = Date.parse('2026-11-08T10:00:05Z');
  const check = createRateLimiter({ perMinute: 2, perDay: 100, now: () => t });
  assert.equal(check('a').ok, true);
  assert.equal(check('a').ok, true);
  const blocked = check('a');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.scope, 'minute');
  assert.equal(blocked.retryAfterS, 55);
  assert.equal(check('b').ok, true, 'andere IP ist nicht betroffen');
  t += 60_000;
  assert.equal(check('a').ok, true);
});

test('Limiter: Tageslimit gilt für alle und endet um Mitternacht UTC', () => {
  let t = Date.parse('2026-11-08T23:59:00Z');
  const check = createRateLimiter({ perMinute: 0, perDay: 2, now: () => t });
  assert.equal(check('a').ok, true);
  assert.equal(check('b').ok, true);
  const blocked = check('c');
  assert.equal(blocked.scope, 'day');
  assert.equal(blocked.retryAfterS, 60);
  t += 60_000;
  assert.equal(check('c').ok, true);
});

test('/api/generate antwortet 429 mit Retry-After, wenn das Limit greift', () =>
  withApi({ rateLimit: createRateLimiter({ perMinute: 1, perDay: 0 }) }, async (base) => {
    assert.equal((await generate(base)).status, 200);
    const res = await generate(base);
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal((await res.json()).error, 'RATE_LIMITED');
  }));

test('X-Forwarded-For zählt nur mit trustProxy', async () => {
  await withApi({ rateLimit: createRateLimiter({ perMinute: 1, perDay: 0 }) }, async (base) => {
    await generate(base, { 'x-forwarded-for': '1.1.1.1' });
    assert.equal((await generate(base, { 'x-forwarded-for': '2.2.2.2' })).status, 429, 'ohne trustProxy gilt die Socket-Adresse');
  });
  await withApi({ rateLimit: createRateLimiter({ perMinute: 1, perDay: 0 }), trustProxy: true }, async (base) => {
    await generate(base, { 'x-forwarded-for': '1.1.1.1' });
    assert.equal((await generate(base, { 'x-forwarded-for': '2.2.2.2' })).status, 200);
  });
});

test('Frontend-Auslieferung: Dateien, SPA-Fallback, kein Ausbruch aus dem Ordner, API bleibt JSON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sepj-dist-'));
  try {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>SEPJ</title>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    await withApi({ serveStatic: createStaticHandler(dir) }, async (base) => {
      const index = await fetch(base + '/');
      assert.equal(index.status, 200);
      assert.match(index.headers.get('content-type'), /text\/html/);
      assert.match(await index.text(), /SEPJ/);

      const asset = await fetch(base + '/assets/app.js');
      assert.match(asset.headers.get('content-type'), /javascript/);
      assert.match(asset.headers.get('cache-control'), /immutable/);
      assert.equal(await asset.text(), 'console.log(1)');

      assert.match(await (await fetch(base + '/irgendeine/seite')).text(), /SEPJ/, 'SPA-Fallback');
      const missing = await fetch(base + '/fehlt.js');
      assert.equal(missing.status, 404);
      await missing.text();
      // ../ wird auf den Ordner begrenzt: es kommt index.html, nie eine Datei von außerhalb
      assert.match(await (await fetch(base + '/%2e%2e/%2e%2e/etc/passwd')).text(), /SEPJ/);

      const api = await fetch(base + '/api/gibtsnicht');
      assert.equal(api.status, 404);
      assert.equal((await api.json()).error, 'NOT_FOUND');
      const health = await fetch(base + '/api/health');
      assert.equal(health.status, 200);
      await health.json();
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Pfade außerhalb des Ordners werden nie gelesen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sepj-dist-'));
  try {
    writeFileSync(join(dir, 'index.html'), 'INDEX');
    const serve = createStaticHandler(dir);
    for (const p of ['/../../etc/passwd', '/..%2f..%2fetc%2fpasswd', '/%00.js']) {
      let head = null;
      const res = { writeHead: (status, h) => { head = { status, h }; }, end() {}, on() {}, once() {}, emit() {}, write() { return true; } };
      const served = serve({ method: 'HEAD' }, res, p);
      if (served) assert.match(head.h['Content-Type'], /text\/html/, p);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createStaticHandler verlangt eine index.html', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sepj-empty-'));
  try { assert.throws(() => createStaticHandler(dir), /index\.html/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
