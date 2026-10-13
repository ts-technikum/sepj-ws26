// Prüft die Zusicherung aus docs/interface-contract.md:
//
//   Jedes zustandsändernde Event führt den vorherigen Wert mit, dadurch ist
//   ein Schritt rückwärts eine Umkehrung des Events statt einer
//   Neuausführung des Algorithmus.
//
// Der Applier unten ist bewusst nur im Test vorhanden. Er zeigt, dass die
// Umkehrung möglich ist — das Abspielen im Renderer gehört nicht hierher.
//
// Läuft ohne Sprachmodell: Die Algorithmen sind von Hand geschrieben und
// stehen stellvertretend für das, was später das Modell liefert.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createViz } from '@sepj/visualization-api';

// ----------------------------------------------- minimaler Applier, nur Test

const forward = (s, e) => {
  switch (e.op) {
    case 'array':     s[e.id] = [...e.values]; break;
    case 'scalar':    s[e.id] = e.value; break;
    case 'setScalar': s[e.id] = e.value; break;
    case 'set':       s[e.id][e.index] = e.value; break;
    case 'swap':      [s[e.id][e.i], s[e.id][e.j]] = [s[e.id][e.j], s[e.id][e.i]]; break;
    case 'graph':     s[e.id] = Object.fromEntries(
                        [...e.nodes.map(n => [`n:${n.id}`, n.state ?? 'default']),
                         ...e.edges.map(x => [`e:${x.id}`, x.state ?? 'default'])]); break;
    case 'nodeState': s[e.id][`n:${e.nodeId}`] = e.state; break;
    case 'edgeState': s[e.id][`e:${e.edgeId}`] = e.state; break;
    default: break;                       // highlight, pointer, step: kein Zustand
  }
};

const backward = (s, e) => {
  switch (e.op) {
    case 'array':     if (e.prev === null) delete s[e.id]; else s[e.id] = [...e.prev]; break;
    case 'scalar':    if (e.prev === null) delete s[e.id]; else s[e.id] = e.prev; break;
    case 'setScalar': s[e.id] = e.prev; break;
    case 'set':       s[e.id][e.index] = e.prev; break;
    case 'swap':      [s[e.id][e.i], s[e.id][e.j]] = [s[e.id][e.j], s[e.id][e.i]]; break;
    case 'graph':     delete s[e.id]; break;
    case 'nodeState': s[e.id][`n:${e.nodeId}`] = e.prev; break;
    case 'edgeState': s[e.id][`e:${e.edgeId}`] = e.prev; break;
    default: break;
  }
};

const copy = (s) => JSON.stringify(s);

// ----------------------------------------------- Referenzalgorithmen

function bubbleSort(viz, input) {
  const a = [...input];
  viz.array('a', a);
  viz.scalar('tausche', 0);
  let swaps = 0;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < a.length - 1 - i; j++) {
      viz.pointer('a', 'j', j);
      viz.highlight('a', { indices: [j, j + 1] }, 'compare');
      viz.step({ line: 3, explanation: `vergleiche ${a[j]} und ${a[j + 1]}` });
      if (a[j] > a[j + 1]) {
        viz.swap('a', j, j + 1);
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        viz.setScalar('tausche', ++swaps);
        viz.step({ line: 4, explanation: 'getauscht' });
      }
    }
    viz.highlight('a', { indices: [a.length - 1 - i] }, 'sorted');
    viz.step({ line: 2, explanation: `Position ${a.length - 1 - i} steht fest` });
  }
  return a;
}

function binarySearch(viz, input, target) {
  const a = [...input];
  viz.array('a', a);
  viz.scalar('ziel', target);
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    viz.highlight('a', { range: [lo, hi] }, 'range');
    const mid = (lo + hi) >> 1;
    viz.pointer('a', 'mid', mid);
    viz.step({ line: 3, explanation: `prüfe Mitte ${mid}, Wert ${a[mid]}` });
    if (a[mid] === target) {
      viz.step({ line: 4, explanation: `gefunden an ${mid}` });
      return mid;
    }
    if (a[mid] < target) lo = mid + 1; else hi = mid - 1;
    viz.step({ line: 6, explanation: `neuer Bereich ${lo}..${hi}` });
  }
  return -1;
}

const GRAPH = {
  nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
  edges: [{ id: 'e1', from: 'A', to: 'B' }, { id: 'e2', from: 'A', to: 'C' },
          { id: 'e3', from: 'B', to: 'D' }, { id: 'e4', from: 'C', to: 'D' }],
  directed: false,
};

function bfs(viz, graph, start) {
  viz.graph('g', graph);
  viz.scalar('besucht', 0);
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    adj.get(e.from).push([e.to, e.id]);
    if (!graph.directed) adj.get(e.to).push([e.from, e.id]);
  }
  const seen = new Set([start]);
  const queue = [start];
  const order = [];
  viz.nodeState('g', start, 'frontier');
  viz.step({ line: 1, explanation: `Start bei ${start}` });
  let n = 0;
  while (queue.length) {
    const cur = queue.shift();
    viz.nodeState('g', cur, 'active');
    viz.step({ line: 3, explanation: `nimm ${cur} aus der Warteschlange` });
    for (const [next, edgeId] of adj.get(cur)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
        viz.edgeState('g', edgeId, 'tree');
        viz.nodeState('g', next, 'frontier');
        viz.step({ line: 5, explanation: `${next} neu entdeckt` });
      } else {
        viz.edgeState('g', edgeId, 'rejected');
        viz.step({ line: 6, explanation: `${next} schon bekannt` });
      }
    }
    viz.nodeState('g', cur, 'visited');
    viz.setScalar('besucht', ++n);
    order.push(cur);
    viz.step({ line: 7, explanation: `${cur} fertig` });
  }
  return order;
}

// ----------------------------------------------- Tests

const ALGORITHMS = [
  ['Bubble Sort', (viz) => bubbleSort(viz, [5, 3, 8, 1, 9, 2])],
  ['Binäre Suche', (viz) => binarySearch(viz, [1, 3, 5, 7, 9, 11, 13], 11)],
  ['Breitensuche', (viz) => bfs(viz, GRAPH, 'A')],
];

describe('Jedes Event ist umkehrbar', () => {
  for (const [name, run] of ALGORITHMS) {
    test(name, () => {
      const { viz, events } = createViz();
      run(viz);

      const state = {};
      const states = [copy(state)];
      for (const e of events) { forward(state, e); states.push(copy(state)); }

      for (let i = events.length - 1; i >= 0; i--) {
        backward(state, events[i]);
        assert.equal(copy(state), states[i],
          `Abweichung beim Rückwärtsgehen nach Event ${i} (${events[i].op})`);
      }
    });
  }
});

describe('Die Algorithmen rechnen richtig', () => {
  test('Bubble Sort sortiert', () => {
    const { viz } = createViz();
    assert.deepEqual(bubbleSort(viz, [5, 3, 8, 1, 9, 2]), [1, 2, 3, 5, 8, 9]);
  });
  test('Binäre Suche findet den Wert', () => {
    const { viz } = createViz();
    assert.equal(binarySearch(viz, [1, 3, 5, 7, 9, 11, 13], 11), 5);
  });
  test('Breitensuche besucht in der richtigen Reihenfolge', () => {
    const { viz } = createViz();
    assert.deepEqual(bfs(viz, GRAPH, 'A'), ['A', 'B', 'C', 'D']);
  });
});

describe('Jedes zustandsändernde Event trägt den Vorgängerwert', () => {
  test('set, setScalar, nodeState und edgeState haben prev', () => {
    const { viz, events } = createViz();
    viz.array('a', [1, 2]);
    viz.set('a', 0, 9);
    viz.scalar('s', 1);
    viz.setScalar('s', 2);
    viz.graph('g', { nodes: [{ id: 'A' }, { id: 'B' }],
                     edges: [{ id: 'e', from: 'A', to: 'B' }] });
    viz.nodeState('g', 'A', 'visited');
    viz.edgeState('g', 'e', 'tree');

    const withPrev = events.filter((e) =>
      ['set', 'setScalar', 'nodeState', 'edgeState'].includes(e.op));
    assert.equal(withPrev.length, 4);
    for (const e of withPrev) {
      assert.ok('prev' in e, `${e.op} trägt keinen Vorgängerwert`);
    }
  });

  test('swap braucht keinen, weil es sein eigenes Gegenstück ist', () => {
    const { viz, events } = createViz();
    viz.array('a', [1, 2]);
    viz.swap('a', 0, 1);
    const swap = events.find((e) => e.op === 'swap');
    assert.ok(!('prev' in swap));
  });
});

describe('Das Vokabular wird durchgesetzt', () => {
  test('unbekannter Knotenzustand wird abgelehnt', () => {
    const { viz } = createViz();
    viz.graph('g', { nodes: [{ id: 'A' }], edges: [] });
    assert.throws(() => viz.nodeState('g', 'A', 'erledigt'),
      /Unbekannter Wert "erledigt".*default, active, frontier, visited/s);
  });
  test('unbekannter Hervorhebungsstil wird abgelehnt', () => {
    const { viz } = createViz();
    viz.array('a', [1]);
    assert.throws(() => viz.highlight('a', { indices: [0] }, 'blinkend'),
      /Unbekannter Wert "blinkend"/);
  });
  test('Zugriff auf eine unbekannte Struktur wird abgelehnt', () => {
    const { viz } = createViz();
    assert.throws(() => viz.set('gibtsnicht', 0, 1), /Kein Array mit id/);
  });
});

describe('Das Eventlimit greift', () => {
  test('bricht beim eingestellten Limit ab', () => {
    const { viz } = createViz({ maxEvents: 50 });
    viz.array('a', [1]);
    assert.throws(() => { for (let i = 0; i < 100; i++) viz.step({ line: 1 }); }, /50/);
  });
});
