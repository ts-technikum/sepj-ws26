// Zustand deterministisch aus Events rekonstruieren; keine Ausführung von Modellcode.
export function getSteps(trace) {
  if (!trace || !Array.isArray(trace.events)) return [];
  const groups = new Map();
  for (const event of trace.events) {
    if (!Number.isInteger(event.group) || event.group < 0) continue;
    if (!groups.has(event.group)) groups.set(event.group, []);
    groups.get(event.group).push(event);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([group, events]) => ({ group, events }));
}
export function stateAt(steps, position) {
  const arrays = {};
  let highlights = {}, pointers = {}, explanation = '', line = null;
  for (let i = 0; i <= position && i < steps.length; i++) {
    // Markierungen gelten nur für den aktuellen Schritt.
    highlights = {}; pointers = {};
    for (const event of steps[i].events) {
      const a = arrays[event.id];
      switch (event.op) {
        case 'array': arrays[event.id] = [...event.values]; break;
        case 'set': if (a && event.index >= 0 && event.index < a.length) a[event.index] = event.value; break;
        case 'swap': if (a && event.i >= 0 && event.j >= 0 && event.i < a.length && event.j < a.length) [a[event.i], a[event.j]] = [a[event.j], a[event.i]]; break;
        case 'highlight': (highlights[event.id] ??= []).push(event); break;
        case 'pointer': (pointers[event.id] ??= []).push(event); break;
        case 'step': explanation = event.explanation ?? ''; line = event.line ?? null; break;
      }
    }
  }
  return { arrays, highlights, pointers, explanation, line };
}
