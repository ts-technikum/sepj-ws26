import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateTrace, NODE_STATES, EDGE_STATES, HIGHLIGHT_STYLES } from '../index.mjs';

const schema = JSON.parse(
  readFileSync(new URL('../trace.schema.json', import.meta.url)));

const wrap = (events) => ({ version: '1.0', events });

describe('Vokabular und Schema bleiben im Gleichklang', () => {
  // Das Vokabular steht in vocabulary.mjs und im Schema. Laufen die beiden
  // auseinander, lässt die Laufzeit Werte durch, die der Validator ablehnt.
  test('Knotenzustände', () => {
    assert.deepEqual(schema.$defs.nodeStateName.enum, [...NODE_STATES]);
  });
  test('Kantenzustände', () => {
    assert.deepEqual(schema.$defs.edgeStateName.enum, [...EDGE_STATES]);
  });
  test('Hervorhebungsstile', () => {
    assert.deepEqual(schema.$defs.highlightStyle.enum, [...HIGHLIGHT_STYLES]);
  });
});

describe('gültige Traces werden angenommen', () => {
  test('Array mit Tausch und Schritt', () => {
    const trace = wrap([
      { op: 'array', id: 'a', values: [3, 1, 2], prev: null, group: 0 },
      { op: 'highlight', id: 'a', target: { indices: [0, 1] }, style: 'compare', group: 0 },
      { op: 'swap', id: 'a', i: 0, j: 1, group: 0 },
      { op: 'step', line: 3, explanation: 'getauscht', group: 0 },
    ]);
    assert.deepEqual(validateTrace(trace, schema), []);
  });

  test('Graph mit Knoten- und Kantenzustand', () => {
    const trace = wrap([
      { op: 'graph', id: 'g',
        nodes: [{ id: 'A' }, { id: 'B' }],
        edges: [{ id: 'e1', from: 'A', to: 'B', weight: 3 }],
        directed: false, group: 0 },
      { op: 'nodeState', id: 'g', nodeId: 'A', state: 'visited', prev: 'default', group: 0 },
      { op: 'edgeState', id: 'g', edgeId: 'e1', state: 'tree', prev: 'default', group: 0 },
      { op: 'step', line: 1, explanation: 'Start', group: 0 },
    ]);
    assert.deepEqual(validateTrace(trace, schema), []);
  });

  test('Bereichshervorhebung und Zeiger', () => {
    const trace = wrap([
      { op: 'array', id: 'a', values: [1, 2, 3], prev: null, group: 0 },
      { op: 'highlight', id: 'a', target: { range: [0, 2] }, style: 'range', group: 0 },
      { op: 'pointer', id: 'a', name: 'mid', index: 1, group: 0 },
      { op: 'step', group: 0 },
    ]);
    assert.deepEqual(validateTrace(trace, schema), []);
  });
});

describe('fehlerhafte Traces werden abgelehnt', () => {
  const cases = [
    ['fehlende Version', { events: [] }],
    ['falsche Version', { version: '2.0', events: [] }],
    ['unbekanntes op', wrap([{ op: 'zeichne', id: 'a', group: 0 }])],
    ['fehlendes group', wrap([{ op: 'swap', id: 'a', i: 0, j: 1 }])],
    ['negativer Index', wrap([{ op: 'swap', id: 'a', i: -1, j: 1, group: 0 }])],
    ['leere id', wrap([{ op: 'swap', id: '', i: 0, j: 1, group: 0 }])],
    ['zusätzliches Feld', wrap([{ op: 'swap', id: 'a', i: 0, j: 1, group: 0, farbe: 'rot' }])],
    ['unbekannter Knotenzustand',
      wrap([{ op: 'nodeState', id: 'g', nodeId: 'A', state: 'erledigt', prev: 'default', group: 0 }])],
    ['unbekannter Stil',
      wrap([{ op: 'highlight', id: 'a', target: { indices: [0] }, style: 'blinkend', group: 0 }])],
    ['target mit beiden Formen',
      wrap([{ op: 'highlight', id: 'a', target: { indices: [0], range: [0, 1] }, style: 'active', group: 0 }])],
    ['Bereich mit drei Werten',
      wrap([{ op: 'highlight', id: 'a', target: { range: [0, 1, 2] }, style: 'range', group: 0 }])],
    ['Kante ohne Ziel',
      wrap([{ op: 'graph', id: 'g', nodes: [{ id: 'A' }], edges: [{ id: 'e', from: 'A' }], group: 0 }])],
  ];

  for (const [label, trace] of cases) {
    test(label, () => {
      assert.ok(validateTrace(trace, schema).length > 0, 'wurde fälschlich angenommen');
    });
  }
});

describe('Fehlermeldungen taugen als Rückmeldung an das Modell', () => {
  // Die Meldung geht in den nächsten Prompt. Sie muss sagen, was falsch ist
  // UND was stattdessen erlaubt wäre.
  test('nennt die erlaubten Stile', () => {
    const [msg] = validateTrace(
      wrap([{ op: 'highlight', id: 'a', target: { indices: [0] }, style: 'blinkend', group: 0 }]),
      schema);
    assert.match(msg, /blinkend/);
    assert.match(msg, /compare, active, swap, sorted, range, excluded/);
  });

  test('nennt die erlaubten Operationen', () => {
    const [msg] = validateTrace(wrap([{ op: 'zeichne', id: 'a', group: 0 }]), schema);
    assert.match(msg, /zeichne/);
    assert.match(msg, /array, graph, scalar/);
  });

  test('nennt das fehlende Feld', () => {
    const [msg] = validateTrace(wrap([{ op: 'swap', id: 'a', i: 0, group: 0 }]), schema);
    assert.match(msg, /Feld "j" fehlt/);
  });
});
