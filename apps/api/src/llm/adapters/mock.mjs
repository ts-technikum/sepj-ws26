// Mock-Adapter für Entwicklung und Tests. Kein Netz, kein Schlüssel, keine Kosten.
//
// Zwei Betriebsarten:
// - Standard: erkennt einige Wünsche an Stichwörtern und liefert feste,
//   geprüfte Antworten (Bubble Sort, binäre Suche, binärer Suchbaum,
//   sonst eine Rückfrage). Das ist KEINE KI; /api/generate meldet das
//   über meta.provider = "mock".
// - script: Liste vorgegebener Antworten (Objekt, String oder Error), die
//   der Reihe nach zurückkommen. Für Tests der Korrekturrunde.

const BUBBLE_SORT = `const a = [...input.values];
viz.array('a', a);
viz.step({ explanation: \`Ausgangslage: \${a.join(', ')}\` });
for (let end = a.length - 1; end > 0; end--) {
  for (let i = 0; i < end; i++) {
    viz.highlight('a', { indices: [i, i + 1] }, 'compare');
    if (a[i] > a[i + 1]) {
      viz.step({ explanation: \`\${a[i]} > \${a[i + 1]}, also tauschen.\` });
      [a[i], a[i + 1]] = [a[i + 1], a[i]];
      viz.swap('a', i, i + 1);
      viz.highlight('a', { indices: [i, i + 1] }, 'swap');
      viz.step({ explanation: \`Getauscht: \${a.join(', ')}\` });
    } else {
      viz.step({ explanation: \`\${a[i]} ≤ \${a[i + 1]}, kein Tausch.\` });
    }
  }
  viz.highlight('a', { range: [end, a.length - 1] }, 'sorted');
  viz.step({ explanation: \`\${a[end]} steht an seinem endgültigen Platz.\` });
}
viz.highlight('a', { range: [0, a.length - 1] }, 'sorted');
viz.step({ explanation: \`Fertig sortiert: \${a.join(', ')}\` });`;

const BINARY_SEARCH = `const a = [...input.values];
const target = input.target;
viz.array('a', a);
viz.scalar('gesucht', target);
viz.step({ explanation: \`Gesucht wird \${target}.\` });
let lo = 0;
let hi = a.length - 1;
let found = -1;
while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  viz.highlight('a', { range: [lo, hi] }, 'range');
  viz.pointer('a', 'mid', mid);
  viz.step({ explanation: \`Suchbereich \${lo} bis \${hi}, Mitte bei Index \${mid} mit Wert \${a[mid]}.\` });
  if (a[mid] === target) { found = mid; break; }
  if (a[mid] < target) {
    viz.highlight('a', { range: [lo, mid] }, 'excluded');
    viz.step({ explanation: \`\${a[mid]} < \${target}, also rechts weitersuchen.\` });
    lo = mid + 1;
  } else {
    viz.highlight('a', { range: [mid, hi] }, 'excluded');
    viz.step({ explanation: \`\${a[mid]} > \${target}, also links weitersuchen.\` });
    hi = mid - 1;
  }
}
if (found >= 0) {
  viz.highlight('a', { indices: [found] }, 'active');
  viz.step({ explanation: \`\${target} gefunden an Index \${found}.\` });
} else {
  viz.step({ explanation: \`\${target} ist nicht im Array enthalten.\` });
}`;

const BST_INSERT = `const nodes = [];
const edges = [];
const left = new Map();
const right = new Map();
viz.graph('t', { nodes: [], edges: [], directed: true });
viz.step({ explanation: \`Leerer Baum. Einzufügen: \${input.values.join(', ')}\` });
let root = null;
input.values.forEach((value, k) => {
  const id = 'n' + k;
  if (root === null) {
    root = id;
  } else {
    let cur = root;
    let parent = null;
    let side = '';
    while (cur !== undefined) {
      viz.nodeState('t', cur, 'active');
      const curValue = Number(nodes.find((n) => n.id === cur).label);
      side = value < curValue ? 'links' : 'rechts';
      viz.step({ explanation: \`\${value} mit \${curValue} vergleichen: weiter nach \${side}.\` });
      viz.nodeState('t', cur, 'visited');
      parent = cur;
      cur = side === 'links' ? left.get(cur) : right.get(cur);
    }
    (side === 'links' ? left : right).set(parent, id);
    edges.push({ id: parent + '-' + id, from: parent, to: id });
  }
  nodes.push({ id, label: String(value) });
  viz.graph('t', { nodes: [...nodes], edges: [...edges], directed: true });
  viz.nodeState('t', id, 'frontier');
  viz.step({ explanation: \`\${value} eingefügt.\` });
});
viz.step({ explanation: \`Fertig: Der Suchbaum enthält \${nodes.length} Knoten.\` });`;

/** Zahlen aus einem Freitext, z. B. "5, 3; 8 und -1" -> [5, 3, 8, -1]. */
export const numbersIn = (text = '') => (text.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((s) => Number(s.replace(',', '.')));

function answer(fields) {
  return { status: 'ok', question: '', inputNote: '', ...fields };
}

export function mockRespond({ prompt, data }) {
  const own = numbersIn(data);
  const p = prompt.toLowerCase();

  if (/bubble/.test(p)) {
    return answer({
      algorithm: 'Bubble Sort',
      inputSource: own.length ? 'user' : 'example',
      input: { kind: 'array', values: own.length ? own : [5, 1, 4, 2, 8] },
      code: BUBBLE_SORT,
    });
  }
  if (/(bin(ä|ae)re?\s*suche|binary\s*search)/.test(p)) {
    const values = own.length >= 2 ? own.slice(0, -1) : [1, 3, 4, 7, 9, 12, 15];
    const target = own.length >= 2 ? own.at(-1) : 9;
    const sorted = [...values].sort((x, y) => x - y);
    const changed = sorted.some((v, i) => v !== values[i]);
    return answer({
      algorithm: 'Binäre Suche',
      inputSource: own.length >= 2 ? 'user' : 'example',
      inputNote: changed ? 'Die Werte wurden aufsteigend sortiert, weil die binäre Suche das voraussetzt.' : '',
      input: { kind: 'search', values: sorted, target },
      code: BINARY_SEARCH,
    });
  }
  if (/(bin(ä|ae)r(er)?\s*(such)?baum|suchbaum|\bbst\b|binary\s*(search\s*)?tree)/.test(p)) {
    return answer({
      algorithm: 'Binärer Suchbaum: Einfügen',
      inputSource: own.length ? 'user' : 'example',
      input: { kind: 'array', values: own.length ? own : [8, 3, 10, 1, 6, 14] },
      code: BST_INSERT,
    });
  }
  return {
    status: 'clarify',
    algorithm: '',
    question: 'Der Mock-Modus kennt nur Bubble Sort, binäre Suche und binären Suchbaum. Welchen davon möchtest du sehen?',
    inputSource: 'none',
    inputNote: '',
    input: null,
    code: '',
  };
}

export function createMockAdapter({ script } = {}) {
  const queue = script ? [...script] : null;
  return {
    provider: 'mock',
    model: 'mock-v1',
    async complete({ request }) {
      let next;
      if (queue) {
        if (queue.length === 0) throw new Error('Mock-Skript ist aufgebraucht');
        next = queue.shift();
        if (next instanceof Error) throw next;
      } else {
        next = mockRespond(request);
      }
      const text = typeof next === 'string' ? next : JSON.stringify(next);
      return { text, assistantContent: text, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } };
    },
  };
}
