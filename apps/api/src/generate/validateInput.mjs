// Prüft und normalisiert das vom Modell gelieferte input-Objekt.
//
// Rückgabe: { input, errors }. Bei Fehlern ist input null. Die Meldungen
// gehen in die Korrekturrunde zurück und nennen deshalb, was erlaubt ist.
// Normalisierung: scalar.params kommt als Liste {name, value} und wird für
// den Code zu einem Objekt { n: 5 }; search bekommt das Feld sorted.

import { LIMITS } from './limits.mjs';

const KINDS = ['array', 'search', 'graph', 'scalar'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkValues(values, path, errors) {
  if (!Array.isArray(values) || values.length === 0) {
    errors.push(`${path}: muss eine nicht leere Liste sein`);
    return;
  }
  if (values.length > LIMITS.maxValues) errors.push(`${path}: höchstens ${LIMITS.maxValues} Werte, sind ${values.length}`);
  values.forEach((v, i) => checkValue(v, `${path}[${i}]`, errors));
}

function checkValue(v, path, errors) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) errors.push(`${path}: Zahl muss endlich sein`);
  } else if (typeof v === 'string') {
    if (v.length === 0 || v.length > LIMITS.maxStringValueChars) errors.push(`${path}: String muss 1 bis ${LIMITS.maxStringValueChars} Zeichen haben`);
  } else {
    errors.push(`${path}: erlaubt sind Zahl oder String`);
  }
}

const isSortedAsc = (values) => values.every((v, i) => i === 0 || values[i - 1] <= v);

export function validateInput(raw) {
  const errors = [];
  if (!isObj(raw)) return { input: null, errors: ['input: muss ein Objekt sein'] };
  if (!KINDS.includes(raw.kind)) {
    return { input: null, errors: [`input.kind: "${raw.kind}" nicht erlaubt. Erlaubt: ${KINDS.join(', ')}`] };
  }

  if (raw.kind === 'array') {
    checkValues(raw.values, 'input.values', errors);
    return errors.length ? { input: null, errors } : { input: { kind: 'array', values: [...raw.values] }, errors };
  }

  if (raw.kind === 'search') {
    checkValues(raw.values, 'input.values', errors);
    checkValue(raw.target, 'input.target', errors);
    if (errors.length) return { input: null, errors };
    return { input: { kind: 'search', values: [...raw.values], target: raw.target, sorted: isSortedAsc(raw.values) }, errors };
  }

  if (raw.kind === 'graph') {
    const { nodes, edges, directed, start } = raw;
    if (!Array.isArray(nodes) || nodes.length === 0) errors.push('input.nodes: muss eine nicht leere Liste sein');
    else if (nodes.length > LIMITS.maxNodes) errors.push(`input.nodes: höchstens ${LIMITS.maxNodes} Knoten, sind ${nodes.length}`);
    if (!Array.isArray(edges)) errors.push('input.edges: muss eine Liste sein');
    else if (edges.length > LIMITS.maxEdges) errors.push(`input.edges: höchstens ${LIMITS.maxEdges} Kanten, sind ${edges.length}`);
    if (typeof directed !== 'boolean') errors.push('input.directed: muss true oder false sein');
    if (errors.length) return { input: null, errors };

    const nodeIds = new Set();
    nodes.forEach((n, i) => {
      if (!isObj(n) || typeof n.id !== 'string' || n.id.length === 0) errors.push(`input.nodes[${i}].id: muss ein nicht leerer String sein`);
      else if (nodeIds.has(n.id)) errors.push(`input.nodes[${i}].id: "${n.id}" kommt doppelt vor`);
      else nodeIds.add(n.id);
    });
    const edgeIds = new Set();
    edges.forEach((e, i) => {
      if (!isObj(e) || typeof e.id !== 'string' || e.id.length === 0) { errors.push(`input.edges[${i}].id: muss ein nicht leerer String sein`); return; }
      if (edgeIds.has(e.id)) errors.push(`input.edges[${i}].id: "${e.id}" kommt doppelt vor`);
      edgeIds.add(e.id);
      for (const end of ['from', 'to']) {
        if (!nodeIds.has(e[end])) errors.push(`input.edges[${i}].${end}: Knoten "${e[end]}" existiert nicht. Vorhanden: ${[...nodeIds].join(', ')}`);
      }
      if (e.weight !== undefined && !Number.isFinite(e.weight)) errors.push(`input.edges[${i}].weight: muss eine Zahl sein`);
    });
    if (!nodeIds.has(start)) errors.push(`input.start: Knoten "${start}" existiert nicht. Vorhanden: ${[...nodeIds].join(', ')}`);
    if (errors.length) return { input: null, errors };
    return {
      input: {
        kind: 'graph',
        nodes: nodes.map((n) => (n.label === undefined ? { id: n.id } : { id: n.id, label: String(n.label) })),
        edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, ...(e.weight === undefined ? {} : { weight: e.weight }) })),
        directed,
        start,
      },
      errors,
    };
  }

  // scalar
  const { params } = raw;
  if (!Array.isArray(params) || params.length === 0) return { input: null, errors: ['input.params: muss eine nicht leere Liste sein'] };
  if (params.length > LIMITS.maxParams) errors.push(`input.params: höchstens ${LIMITS.maxParams} Parameter, sind ${params.length}`);
  const out = {};
  params.forEach((p, i) => {
    if (!isObj(p) || typeof p.name !== 'string' || !IDENT.test(p.name)) { errors.push(`input.params[${i}].name: muss ein Bezeichner wie n oder max_wert sein`); return; }
    if (Object.hasOwn(out, p.name)) errors.push(`input.params[${i}].name: "${p.name}" kommt doppelt vor`);
    if (typeof p.value !== 'number' || !Number.isFinite(p.value)) errors.push(`input.params[${i}].value: muss eine endliche Zahl sein`);
    out[p.name] = p.value;
  });
  return errors.length ? { input: null, errors } : { input: { kind: 'scalar', params: out }, errors };
}
