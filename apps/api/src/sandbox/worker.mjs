// Läuft in einem eigenen worker_thread. Führt generierten Code in QuickJS
// (WebAssembly) aus: Dort gibt es keine Node-, Netz- oder Dateisystem-APIs.
// Nur JSON verlässt die Engine. Der Worker selbst ist die Notbremse: Der
// Hauptthread beendet ihn hart, falls QuickJS nicht rechtzeitig abbricht.

import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten';

const USER_FILE = 'user.js';

// viz-Laufzeit und Vokabular als Skript (ohne import/export) für QuickJS.
function loadRuntimeSource() {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const strip = (src) => src
    .replace(/^import\s[^;]+;\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\}[^;]*;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  return [
    strip(read('../../../../packages/trace-schema/vocabulary.mjs')),
    strip(read('../../../../packages/visualization-api/viz-runtime.mjs')),
  ].join('\n');
}

// Ermittelt die Zeile im Modellcode aus einem QuickJS-Stack ("at f (user.js:7:3)").
const LINE_OF = `
function __lineOf(stack) {
  const m = /${USER_FILE.replace('.', '\\.')}:(\\d+)/.exec(String(stack || ''));
  return m ? Number(m[1]) : null;
}`;

function setupSource(input, maxEvents) {
  return `
const __rec = createViz({ maxEvents: ${Number(maxEvents)} });
const __events = __rec.events;
const __viz = __rec.viz;
const __step = __viz.step;
// step.line kommt von der Laufzeit: Zeile des viz.step-Aufrufs im Modellcode.
__viz.step = function (o) {
  const line = __lineOf(new Error().stack);
  return __step({ line, explanation: o && o.explanation });
};
const __deepFreeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(__deepFreeze); Object.freeze(v); } return v; };
var __input = __deepFreeze(${JSON.stringify(input)});
var __vizApi = Object.freeze(__viz);
var __result = { error: null, truncated: false };
`;
}

// Zeile 1 des Modellcodes ist Zeile 1 von user.js: Der Wrapper steht in derselben Zeile.
const userSource = (code) =>
  `(function (input, viz) { "use strict"; try { (function () {${code}\n})(); } catch (e) { if (e instanceof EventLimitError) { __result.truncated = true; } else { __result.error = { message: String(e && e.message || e), line: __lineOf(e && e.stack) }; } } })(__input, __vizApi);`;

async function run({ code, input, timeoutMs, memoryMb, maxEvents }) {
  const QuickJS = await getQuickJS();
  const rt = QuickJS.newRuntime();
  rt.setMemoryLimit(memoryMb * 1024 * 1024);
  rt.setMaxStackSize(1024 * 1024);
  rt.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));
  const vm = rt.newContext();
  const evalOrThrow = (src, file) => {
    const r = vm.evalCode(src, file);
    if (r.error) { const e = vm.dump(r.error); r.error.dispose(); return e; }
    r.value.dispose();
    return null;
  };
  try {
    const setupErr = evalOrThrow(`${loadRuntimeSource()}\n${LINE_OF}\n${setupSource(input, maxEvents)}`, 'runtime.js');
    if (setupErr) return { kind: 'INTERNAL', message: `Laufzeit konnte nicht starten: ${JSON.stringify(setupErr)}` };

    const userErr = evalOrThrow(userSource(code), USER_FILE);
    if (userErr) {
      const msg = typeof userErr === 'object' ? String(userErr.message ?? JSON.stringify(userErr)) : String(userErr);
      if (/interrupted/i.test(msg)) return { kind: 'TIMEOUT', message: `Zeitlimit von ${timeoutMs} ms überschritten` };
      if (/out of memory/i.test(msg)) return { kind: 'MEMORY', message: `Speicherlimit von ${memoryMb} MB überschritten` };
      return { kind: 'RUNTIME', message: msg, line: null };
    }

    const out = vm.evalCode('JSON.stringify({ events: __events, result: __result })', 'collect.js');
    if (out.error) { out.error.dispose(); return { kind: 'INTERNAL', message: 'Trace konnte nicht gelesen werden' }; }
    const { events, result } = JSON.parse(vm.getString(out.value));
    out.value.dispose();
    if (result.error) {
      const m = result.error.message;
      if (/interrupted/i.test(m)) return { kind: 'TIMEOUT', message: `Zeitlimit von ${timeoutMs} ms überschritten` };
      if (/out of memory/i.test(m)) return { kind: 'MEMORY', message: `Speicherlimit von ${memoryMb} MB überschritten` };
      return { kind: 'RUNTIME', message: m, line: result.error.line, events };
    }
    return { kind: 'OK', events, truncated: result.truncated };
  } finally {
    vm.dispose();
    rt.dispose();
  }
}

run(workerData).then(
  (r) => parentPort.postMessage(r),
  (e) => parentPort.postMessage({ kind: 'INTERNAL', message: String(e?.message ?? e) }),
);
