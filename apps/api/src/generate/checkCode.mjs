// Statische Prüfung des generierten Codes vor der Ausführung.
//
// Das ist KEINE Sicherheitsgrenze. Die Sicherheit kommt aus der Sandbox
// (apps/api/src/sandbox). Diese Prüfung fängt früh und billig ab, was sich durch eine
// Korrekturrunde beheben lässt: Syntaxfehler, verbotene Bezeichner,
// unbekannte viz-Aufrufe. Wörter werden auch in Strings und Kommentaren
// abgelehnt; das ist bewusst streng und steht so im Prompt.

import { LIMITS } from './limits.mjs';

export const VIZ_METHODS = Object.freeze([
  'array', 'graph', 'scalar',
  'set', 'swap', 'setScalar', 'nodeState', 'edgeState',
  'highlight', 'pointer',
  'step',
]);

export const FORBIDDEN = Object.freeze([
  'require', 'import', 'export', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker',
  'process', 'globalThis', 'global', 'window', 'self', 'document',
  'eval', 'Function', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask',
  'Promise', 'async', 'await', 'constructor', '__proto__', 'Reflect', 'Proxy', 'console',
]);

const DECLARATIONS = ['array', 'graph', 'scalar'];

export function checkCode(code) {
  if (typeof code !== 'string' || code.trim() === '') return ['code: darf nicht leer sein'];
  if (code.length > LIMITS.maxCodeChars) return [`code: höchstens ${LIMITS.maxCodeChars} Zeichen, sind ${code.length}`];

  const errors = [];

  const found = FORBIDDEN.filter((w) => new RegExp(`(^|[^A-Za-z0-9_$])${w.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`).test(code));
  if (found.length) errors.push(`code: verbotene Bezeichner ${found.join(', ')}. Erlaubt sind nur input, viz und eingebaute Sprachmittel wie Math, Array, Map, Set`);

  if (/\bviz\s*\[/.test(code)) errors.push('code: viz darf nur mit Punkt aufgerufen werden, zum Beispiel viz.step(...)');

  const called = [...code.matchAll(/\bviz\s*\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const unknown = [...new Set(called.filter((m) => !VIZ_METHODS.includes(m)))];
  if (unknown.length) errors.push(`code: unbekannte viz-Methode ${unknown.join(', ')}. Erlaubt: ${VIZ_METHODS.join(', ')}`);
  if (!called.some((m) => DECLARATIONS.includes(m))) errors.push(`code: mindestens eine Struktur muss mit viz.${DECLARATIONS.join(', viz.')} angelegt werden`);
  if (!called.includes('step')) errors.push('code: mindestens ein viz.step({ explanation }) fehlt');

  // Syntaxprüfung: Der Function-Konstruktor übersetzt den Block nur, er führt
  // ihn nicht aus. Ausgeführt wird ausschließlich in der Sandbox.
  try {
    // eslint-disable-next-line no-new-func
    new Function('input', 'viz', `"use strict";\n${code}`);
  } catch (err) {
    errors.push(`code: Syntaxfehler: ${err.message}`);
  }

  return errors;
}
