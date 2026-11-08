// JSON-Schema für die strukturierte Modellantwort (output_config.format).
//
// Einschränkungen der Structured Outputs: jedes Objekt braucht
// additionalProperties: false, keine Längen- oder Zahlengrenzen, keine
// Rekursion. Grenzen prüft deshalb validateInput.mjs nach der Antwort.
// Skalare kommen als Liste {name, value}, weil ein Objekt mit frei
// benannten Schlüsseln (additionalProperties: Zahl) nicht erlaubt ist.

const value = { anyOf: [{ type: 'number' }, { type: 'string' }] };
const obj = (properties, required = Object.keys(properties)) =>
  ({ type: 'object', additionalProperties: false, required, properties });

const arrayInput = obj({ kind: { const: 'array' }, values: { type: 'array', items: value } });
const searchInput = obj({ kind: { const: 'search' }, values: { type: 'array', items: value }, target: value });
const graphInput = obj({
  kind: { const: 'graph' },
  nodes: { type: 'array', items: obj({ id: { type: 'string' }, label: { type: 'string' } }, ['id']) },
  edges: { type: 'array', items: obj({
    id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, weight: { type: 'number' },
  }, ['id', 'from', 'to']) },
  directed: { type: 'boolean' },
  start: { type: 'string' },
});
const scalarInput = obj({
  kind: { const: 'scalar' },
  params: { type: 'array', items: obj({ name: { type: 'string' }, value: { type: 'number' } }) },
});

export const RESPONSE_SCHEMA = obj({
  status: { enum: ['ok', 'clarify'] },
  algorithm: { type: 'string' },
  question: { type: 'string' },
  inputSource: { enum: ['user', 'example', 'none'] },
  inputNote: { type: 'string' },
  input: { anyOf: [arrayInput, searchInput, graphInput, scalarInput, { type: 'null' }] },
  code: { type: 'string' },
});
