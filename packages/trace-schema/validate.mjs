// Minimaler Prüfer für die Teilmenge von JSON Schema, die trace.schema.json
// verwendet: $ref, type, const, enum, required, properties,
// additionalProperties, items, minItems, maxItems, minimum, minLength, oneOf.
//
// Zweck: Die Prüfung läuft ohne Abhängigkeiten, damit sie in jeder
// Umgebung funktioniert. In der CI kann zusätzlich ajv gegen dieselbe
// Schemadatei laufen — es gibt nur eine Quelle.

const typeOf = (v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number'
    ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;

function resolve(schema, root) {
  if (!schema?.$ref) return schema;
  const path = schema.$ref.replace(/^#\//, '').split('/');
  return path.reduce((acc, key) => acc[key], root);
}

function check(value, schema, root, path, errors) {
  schema = resolve(schema, root);
  if (!schema) return;

  if (schema.oneOf) {
    // Wenn die Variante am Feld "op" erkennbar ist, direkt gegen sie prüfen.
    // Sonst lautet die Meldung nur "passt auf keine Variante" und sagt nicht,
    // was konkret falsch ist — unbrauchbar als Rückmeldung an das Modell.
    if (value && typeof value === 'object' && typeof value.op === 'string') {
      const variant = schema.oneOf
        .map((s) => resolve(s, root))
        .find((s) => s.properties?.op?.const === value.op);
      if (variant) { check(value, variant, root, path, errors); return; }
      const known = schema.oneOf
        .map((s) => resolve(s, root).properties?.op?.const)
        .filter(Boolean);
      errors.push(`${path}: unbekanntes op "${value.op}". Erlaubt: ${known.join(', ')}`);
      return;
    }
    const matches = schema.oneOf.filter((s) => check2(value, s, root) === 0);
    if (matches.length !== 1) {
      const names = schema.oneOf.map((s) => resolve(s, root).title ?? '?').join(' oder ');
      errors.push(`${path}: passt auf ${matches.length} von ${schema.oneOf.length} Varianten (${names})`);
    }
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: erwartet ${JSON.stringify(schema.const)}, ist ${JSON.stringify(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: "${value}" nicht erlaubt. Erlaubt: ${schema.enum.join(', ')}`);
    return;
  }

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.includes(actual) ||
               (allowed.includes('number') && actual === 'integer');
    if (!ok) {
      errors.push(`${path}: Typ ${actual}, erwartet ${allowed.join(' oder ')}`);
      return;
    }
    if (actual === 'null') return;        // null erfüllt keine weiteren Regeln
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: ${value} kleiner als Minimum ${schema.minimum}`);
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path}: Zeichenkette kürzer als ${schema.minLength}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: ${value.length} Einträge, mindestens ${schema.minItems} nötig`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: ${value.length} Einträge, höchstens ${schema.maxItems} erlaubt`);
    }
    if (schema.items) {
      value.forEach((v, i) => check(v, schema.items, root, `${path}[${i}]`, errors));
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: Feld "${key}" fehlt`);
    }
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) check(v, sub, root, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) {
        errors.push(`${path}: unbekanntes Feld "${key}"`);
      }
    }
  }
}

/** Stille Variante für oneOf: liefert nur die Anzahl der Fehler. */
function check2(value, schema, root) {
  const errs = [];
  check(value, schema, root, '', errs);
  return errs.length;
}

/** Prüft einen Trace gegen das Schema. Liefert eine Liste von Fehlern. */
export function validateTrace(trace, schema) {
  const errors = [];
  check(trace, schema, schema, 'trace', errors);
  return errors;
}
