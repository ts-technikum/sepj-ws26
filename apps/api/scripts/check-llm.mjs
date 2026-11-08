// Prüft die Verbindung zum Sprachmodell mit einer einzigen Anfrage.
//
// Aufruf (im Repo-Wurzelverzeichnis): npm run check:llm
// Liest apps/api/.env (LLM_PROVIDER, ANTHROPIC_API_KEY, LLM_EFFORT).
// Ohne .env läuft der Mock, das zeigt die Ausgabe unter "Anbieter".
// Kostet bei LLM_PROVIDER=anthropic eine echte Anfrage.

import { createLlmFromEnv } from '../src/llm/index.mjs';
import { generate } from '../src/generate/generate.mjs';

const prompt = process.argv[2] || 'Zeig mir Bubble Sort';
const data = process.argv[3] ?? '5, 3, 8, 1';

const llm = await createLlmFromEnv();
console.log(`Anbieter: ${llm.provider}, Modell: ${llm.model}`);
console.log(`Wunsch: ${prompt}${data ? `, Daten: ${data}` : ''}`);

try {
  const result = await generate({ prompt, data }, { llm });
  console.log(`Status: ${result.status}`);
  if (result.status === 'clarify') {
    console.log(`Rückfrage: ${result.question}`);
  } else {
    console.log(`Algorithmus: ${result.algorithm}`);
    console.log(`input: ${JSON.stringify(result.input)} (${result.inputSource})`);
    const steps = result.trace.events.filter((e) => e.op === 'step').length;
    console.log(`Trace: ${result.trace.events.length} Events, ${steps} Schritte, gekürzt: ${result.trace.truncated}`);
  }
  console.log(`Versuche: ${result.meta.attempts}, Dauer: ${result.meta.durationMs} ms`);
  console.log(`Tokens: ${JSON.stringify(result.meta.usage)}`);
} catch (err) {
  console.error(`Fehler: ${err.code ?? err.name} (${err.status ?? '-'})`);
  for (const d of err.details ?? [err.message]) console.error(`  ${d}`);
  process.exitCode = 1;
}
