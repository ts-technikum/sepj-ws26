// Führt generierten Code isoliert aus und liefert die viz-Events.
//
// Zwei Schichten:
// 1. QuickJS (WebAssembly) im Worker: keine Host-APIs, Speicher- und
//    Zeitlimit, Eventlimit über createViz.
// 2. worker_thread mit eigenem Timer: wird hart beendet, wenn QuickJS nicht
//    rechtzeitig abbricht (im Prototyp vom 13.10. dauerte "out of memory"
//    bis zu 19 s trotz Deadline).
//
// Ergebnis: { events, truncated } oder Wurf eines SandboxError.

import { Worker } from 'node:worker_threads';

export const SANDBOX_DEFAULTS = Object.freeze({
  timeoutMs: 2000,     // Rechenzeit in QuickJS
  graceMs: 1500,       // danach beendet der Hauptthread den Worker
  memoryMb: 32,        // QuickJS-Heap
  maxEvents: 50000,    // wie interface-contract.md Abschnitt 6
});

export const SANDBOX_ERROR_STATUS = Object.freeze({
  SANDBOX_RUNTIME_ERROR: 422,   // Ausnahme im Algorithmus
  SANDBOX_TIMEOUT: 422,         // Lauf zu lang
  SANDBOX_MEMORY: 422,          // Speicherlimit
  SANDBOX_INTERNAL: 500,        // Fehler der Sandbox selbst
});

export class SandboxError extends Error {
  constructor(code, message, { line = null } = {}) {
    super(message);
    this.code = code;
    this.status = SANDBOX_ERROR_STATUS[code] ?? 500;
    this.line = line;
  }
}

export function runInSandbox(code, input, options = {}) {
  const o = { ...SANDBOX_DEFAULTS, ...options };
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
      workerData: { code, input, timeoutMs: o.timeoutMs, memoryMb: o.memoryMb, maxEvents: o.maxEvents },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      env: {},           // keine Umgebungsvariablen (API-Schlüssel!) im Worker
      stdout: true,      // Ausgaben des Workers nicht in die Server-Konsole
      stderr: true,
    });
    let settled = false;
    const finish = (fn) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate(); fn(); };
    const timer = setTimeout(
      () => finish(() => reject(new SandboxError('SANDBOX_TIMEOUT', `Zeitlimit überschritten, Ausführung hart abgebrochen`))),
      o.timeoutMs + o.graceMs,
    );

    worker.once('message', (r) => finish(() => {
      switch (r.kind) {
        case 'OK': return resolve({ events: r.events, truncated: r.truncated });
        case 'TIMEOUT': return reject(new SandboxError('SANDBOX_TIMEOUT', r.message));
        case 'MEMORY': return reject(new SandboxError('SANDBOX_MEMORY', r.message));
        case 'RUNTIME': return reject(new SandboxError('SANDBOX_RUNTIME_ERROR', r.line ? `Zeile ${r.line}: ${r.message}` : r.message, { line: r.line }));
        default: return reject(new SandboxError('SANDBOX_INTERNAL', r.message));
      }
    }));
    worker.once('error', (e) => finish(() => reject(new SandboxError('SANDBOX_INTERNAL', e.message))));
    worker.once('exit', (c) => finish(() => reject(new SandboxError('SANDBOX_INTERNAL', `Worker beendet (Code ${c})`))));
  });
}
