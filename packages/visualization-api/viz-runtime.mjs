// Die viz-API und ihr Zustandsmodell.
//
// Der generierte Code ruft nur diese Methoden. Die Laufzeit führt den
// Zustand mit und ergänzt bei jeder Änderung den Vorgängerwert, damit
// Rückwärtsnavigation ohne Neuausführung möglich ist.

import { NODE_STATES, EDGE_STATES, HIGHLIGHT_STYLES, assertIn } from '@sepj/trace-schema';

export class EventLimitError extends Error {}

export function createViz({ maxEvents = 50000 } = {}) {
  const events = [];
  const structures = new Map();   // id -> aktueller Zustand
  let group = 0;                  // laufender Schritt

  const push = (event) => {
    if (events.length >= maxEvents) throw new EventLimitError(String(maxEvents));
    events.push({ ...event, group });
  };

  const arr = (id) => {
    const s = structures.get(id);
    if (!s || s.kind !== 'array') throw new Error(`Kein Array mit id "${id}"`);
    return s;
  };
  const gph = (id) => {
    const s = structures.get(id);
    if (!s || s.kind !== 'graph') throw new Error(`Kein Graph mit id "${id}"`);
    return s;
  };

  const viz = {
    // --- Deklaration ---------------------------------------------------
    array(id, values) {
      const prev = structures.get(id)?.values ?? null;
      structures.set(id, { kind: 'array', values: [...values] });
      push({ op: 'array', id, values: [...values], prev });
    },
    graph(id, { nodes, edges, directed = false }) {
      structures.set(id, {
        kind: 'graph',
        nodes: new Map(nodes.map(n => [n.id, { ...n, state: n.state ?? 'default' }])),
        edges: new Map(edges.map(e => [e.id, { ...e, state: e.state ?? 'default' }])),
        directed,
      });
      push({ op: 'graph', id, nodes, edges, directed });
    },
    scalar(id, value) {
      const prev = structures.get(id)?.value ?? null;
      structures.set(id, { kind: 'scalar', value });
      push({ op: 'scalar', id, value, prev });
    },

    // --- Zustandsänderung (Vorgängerwert wird automatisch ergänzt) ---
    set(id, index, value) {
      const s = arr(id);
      const prev = s.values[index];
      s.values[index] = value;
      push({ op: 'set', id, index, value, prev });
    },
    swap(id, i, j) {
      const s = arr(id);
      [s.values[i], s.values[j]] = [s.values[j], s.values[i]];
      push({ op: 'swap', id, i, j });            // selbstinvers, kein prev nötig
    },
    setScalar(id, value) {
      const s = structures.get(id);
      const prev = s?.value ?? null;
      if (s) s.value = value; else structures.set(id, { kind: 'scalar', value });
      push({ op: 'setScalar', id, value, prev });
    },
    nodeState(id, nodeId, state) {
      assertIn(state, NODE_STATES, 'nodeState');
      const g = gph(id);
      const n = g.nodes.get(nodeId);
      if (!n) throw new Error(`Knoten "${nodeId}" existiert nicht in "${id}"`);
      const prev = n.state;
      n.state = state;
      push({ op: 'nodeState', id, nodeId, state, prev });
    },
    edgeState(id, edgeId, state) {
      assertIn(state, EDGE_STATES, 'edgeState');
      const g = gph(id);
      const e = g.edges.get(edgeId);
      if (!e) throw new Error(`Kante "${edgeId}" existiert nicht in "${id}"`);
      const prev = e.state;
      e.state = state;
      push({ op: 'edgeState', id, edgeId, state, prev });
    },

    // --- Hervorhebung, rein visuell, kein Zustand ----------------------
    highlight(id, target, style = 'active') {
      assertIn(style, HIGHLIGHT_STYLES, 'highlight');
      push({ op: 'highlight', id, target, style });
    },
    pointer(id, name, index) {
      push({ op: 'pointer', id, name, index });
    },

    // --- Schrittgrenze --------------------------------------------------
    step({ line, explanation } = {}) {
      push({ op: 'step', line, explanation });
      group++;
    },
  };

  return { viz, events, structureCount: () => structures.size };
}
