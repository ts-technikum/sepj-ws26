// Bewertet eine Antwort von generate() gegen die Erwartung eines Testfalls.
//
// Zwei Arten von Prüfungen:
// - Eingabe: Wurde die Form von input richtig gewählt und wurden die Daten
//   der Lehrperson genau übernommen?
// - Ergebnis: Stimmt der Endzustand im Trace fachlich (sortiert, alle Knoten
//   besucht, richtiger Zahlenwert, Baumgröße)? Dafür werden die Events
//   nachgespielt, wie es auch der Renderer tut.
// Was sich nicht automatisch prüfen lässt (Verständlichkeit der Erklärungen),
// bleibt für die Stichprobe von Hand.

const sameMultiset = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].map(String).sort();
  const sb = [...b].map(String).sort();
  return sa.every((v, i) => v === sb[i]);
};
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const isSortedAsc = (v) => v.every((x, i) => i === 0 || v[i - 1] <= x);

// Spielt die Events nach und liefert den Endzustand aller Strukturen.
export function replay(events) {
  const arrays = new Map();
  const scalars = new Map();
  const graphs = new Map();
  const visited = new Set();
  let firstArray = null;
  for (const e of events) {
    switch (e.op) {
      case 'array':
        arrays.set(e.id, [...e.values]);
        if (firstArray === null) firstArray = e.id;
        break;
      case 'set':
        arrays.get(e.id)[e.index] = e.value;
        break;
      case 'swap': {
        const a = arrays.get(e.id);
        [a[e.i], a[e.j]] = [a[e.j], a[e.i]];
        break;
      }
      case 'scalar':
      case 'setScalar':
        scalars.set(e.id, e.value);
        break;
      case 'graph':
        graphs.set(e.id, { nodes: e.nodes, edges: e.edges });
        break;
      case 'nodeState':
        if (e.state === 'visited') visited.add(`${e.id}/${e.nodeId}`);
        break;
      default:
        break;
    }
  }
  return { arrays, scalars, graphs, visited, firstArray };
}

function reachable(input) {
  const adj = new Map(input.nodes.map((n) => [n.id, []]));
  for (const e of input.edges) {
    adj.get(e.from)?.push(e.to);
    if (!input.directed) adj.get(e.to)?.push(e.from);
  }
  const seen = new Set([input.start]);
  const queue = [input.start];
  while (queue.length) {
    for (const n of adj.get(queue.shift()) ?? []) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return seen;
}

export function checkResult(spec, response) {
  const state = replay(response.trace.events);
  if (spec.type === 'sorted') {
    const final = state.arrays.get(state.firstArray);
    return Boolean(final) && isSortedAsc(final) && sameMultiset(final, response.input.values);
  }
  if (spec.type === 'scalar') {
    return [...state.scalars.values()].includes(spec.value);
  }
  if (spec.type === 'treeNodes') {
    return [...state.graphs.values()].some((g) => g.nodes.length === spec.count);
  }
  if (spec.type === 'allVisited') {
    const need = reachable(response.input);
    return [...state.graphs.keys()].some((gid) => [...need].every((n) => state.visited.has(`${gid}/${n}`)));
  }
  throw new Error(`Unbekannte Ergebnisprüfung "${spec.type}"`);
}

// response: Rückgabe von generate() oder { status: 'error', error: { code } }.
// Rückgabe: { checks: { name: true|false }, pass }
export function evaluateCase(testCase, response) {
  const exp = testCase.expect;
  const checks = {};
  checks.status = exp.status.includes(response.status);

  if (response.status === 'ok') {
    const input = response.input;
    const want = { ...exp, ...(exp.ifOk ?? {}) };
    if (want.kind) checks.kind = input.kind === want.kind;
    if (want.inputSource) checks.inputSource = response.inputSource === want.inputSource;
    if (want.values) checks.values = sameList(input.values, want.values);
    if (want.sameValues) checks.sameValues = sameMultiset(input.values, want.sameValues);
    if ('target' in want) checks.target = input.target === want.target;
    if ('sorted' in want) checks.sorted = input.sorted === want.sorted;
    if (want.inputNote) checks.inputNote = typeof response.inputNote === 'string' && response.inputNote.trim().length > 0;
    if (want.nodeIds) checks.nodeIds = sameMultiset(input.nodes?.map((n) => n.id), want.nodeIds);
    if (want.start) checks.start = input.start === want.start;
    if (want.weighted) checks.weighted = Array.isArray(input.edges) && input.edges.length > 0 && input.edges.every((e) => typeof e.weight === 'number');
    if (want.params) checks.params = Object.entries(want.params).every(([k, v]) => input.params?.[k] === v);
    if (want.paramValues) checks.paramValues = sameMultiset(Object.values(input.params ?? {}), want.paramValues);
    checks.traceComplete = response.trace?.truncated === false;
    if (want.result) {
      try { checks.result = checkResult(want.result, response); } catch { checks.result = false; }
    }
  }
  const pass = Object.values(checks).every(Boolean);
  return { checks, pass };
}
