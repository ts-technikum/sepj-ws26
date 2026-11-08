// Lässt die Testfälle aus cases.json gegen den eingestellten Anbieter laufen.
//
// Aufruf (im Repo-Wurzelverzeichnis):
//   npm run eval                              alle Fälle, je einmal
//   npm run eval -- --only bubble-user,bfs-user
//   npm run eval -- --set schwer              nur die schwierigen Fälle
//   npm run eval -- --repeat 3                jeden Fall dreimal (Streuung)
//
// Liest apps/api/.env. Ohne .env läuft der Mock (kostenlos, aber keine KI).
// Mit LLM_PROVIDER=anthropic kostet jeder Fall eine bis zwei echte Anfragen.
// Ergebnis: eval/results/<Zeitpunkt>_<Promptversion>_<Anbieter>.json und .md

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createLlmFromEnv } from '../src/llm/index.mjs';
import { generate } from '../src/generate/generate.mjs';
import { PROMPT_VERSION } from '../src/llm/systemPrompt.mjs';
import { evaluateCase } from './evaluate.mjs';

function parseArgs(argv) {
  const opts = { only: null, repeat: 1, set: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') opts.only = new Set(argv[++i].split(','));
    else if (argv[i] === '--set') opts.set = argv[++i];
    else if (argv[i] === '--repeat') opts.repeat = Math.max(1, Number(argv[++i]) || 1);
    else throw new Error(`Unbekannte Option ${argv[i]}. Erlaubt: --only id,id  --set basis|schwer  --repeat n`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const { cases } = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const selected = cases.filter((c) => (!opts.only || opts.only.has(c.id)) && (!opts.set || c.set === opts.set));
if (selected.length === 0) throw new Error('Keine Fälle ausgewählt');

const llm = await createLlmFromEnv();
console.log(`Anbieter ${llm.provider}, Modell ${llm.model}, Prompt ${PROMPT_VERSION}, ${selected.length} Fälle x ${opts.repeat}\n`);

const runs = [];
for (const testCase of selected) {
  for (let r = 1; r <= opts.repeat; r++) {
    const started = Date.now();
    const body = { prompt: testCase.prompt };
    if (testCase.data !== undefined) body.data = testCase.data;
    let response;
    try {
      response = await generate(body, { llm });
    } catch (err) {
      response = { status: 'error', error: { code: err.code ?? err.name, details: err.details ?? [err.message] }, meta: err.meta };
    }
    const { checks, pass } = evaluateCase(testCase, response);
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
    const run = {
      id: testCase.id,
      set: testCase.set ?? null,
      repeat: r,
      negative: Boolean(testCase.negative),
      pass,
      failedChecks: failed,
      status: response.status,
      errorCode: response.error?.code ?? null,
      attempts: response.meta?.attempts ?? null,
      durationMs: response.meta?.durationMs ?? Date.now() - started,
      usage: response.meta?.usage ?? null,
      checks,
      algorithm: response.algorithm ?? null,
      inputSource: response.inputSource ?? null,
      inputNote: response.inputNote ?? null,
      question: response.question ?? null,
      input: response.input ?? null,
      steps: response.trace ? response.trace.events.filter((e) => e.op === 'step').length : null,
      details: response.error?.details ?? null,
      code: response.code ?? null,
    };
    runs.push(run);
    const label = `${testCase.id}${opts.repeat > 1 ? ` #${r}` : ''}`;
    const extra = failed.length ? `, falsch: ${failed.join(', ')}` : '';
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${label}: ${run.status}${run.errorCode ? ` ${run.errorCode}` : ''}, Versuche ${run.attempts ?? '-'}, ${run.durationMs} ms${extra}`);
  }
}

const sum = (f) => runs.reduce((s, r) => s + (f(r) ?? 0), 0);
const summary = {
  runs: runs.length,
  passed: runs.filter((r) => r.pass).length,
  firstAttempt: runs.filter((r) => r.attempts === 1 && r.status !== 'error').length,
  errors: runs.filter((r) => r.status === 'error').length,
  avgDurationMs: Math.round(sum((r) => r.durationMs) / runs.length),
  tokens: {
    input: sum((r) => r.usage?.inputTokens),
    output: sum((r) => r.usage?.outputTokens),
    cacheRead: sum((r) => r.usage?.cacheReadTokens),
    cacheWrite: sum((r) => r.usage?.cacheWriteTokens),
  },
};

const createdAt = new Date().toISOString();
const base = `${createdAt.replace(/:/g, '-').slice(0, 19)}_${PROMPT_VERSION}_${llm.provider}`;
const dir = new URL('./results/', import.meta.url);
mkdirSync(dir, { recursive: true });
const meta = { createdAt, provider: llm.provider, model: llm.model, promptVersion: PROMPT_VERSION, effort: process.env.LLM_EFFORT || 'medium', repeat: opts.repeat };
writeFileSync(new URL(`${base}.json`, dir), JSON.stringify({ meta, summary, runs }, null, 2) + '\n');

const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 140);
const md = [
  `# Evaluation ${PROMPT_VERSION} (${llm.provider}, ${llm.model})`,
  '',
  `Erstellt ${createdAt}, effort ${meta.effort}, ${opts.repeat} Durchlauf/Durchläufe pro Fall.`,
  '',
  `Bestanden ${summary.passed} von ${summary.runs}. Gültig im ersten Versuch: ${summary.firstAttempt}. Fehler: ${summary.errors}. Dauer im Schnitt: ${summary.avgDurationMs} ms.`,
  '',
  ...[...new Set(runs.map((r) => r.set ?? '-'))].map((set) => {
    const rs = runs.filter((r) => (r.set ?? '-') === set);
    return `Teilmenge ${set}: ${rs.filter((r) => r.pass).length} von ${rs.length} bestanden.\n`;
  }),
  `Tokens: ${summary.tokens.input} Eingabe, ${summary.tokens.cacheRead} aus dem Cache, ${summary.tokens.cacheWrite} in den Cache, ${summary.tokens.output} Ausgabe.`,
  '',
  '| Fall | Ergebnis | Status | Versuche | Dauer ms | Schritte | falsche Prüfungen | Rückfrage oder Fehler |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...runs.map((r) => {
    const note = r.question ?? (r.details ? `${r.errorCode}: ${r.details[0]}` : '-');
    return `| ${r.id}${opts.repeat > 1 ? ` #${r.repeat}` : ''} | ${r.pass ? 'bestanden' : 'nicht bestanden'} | ${r.status} | ${r.attempts ?? '-'} | ${r.durationMs} | ${r.steps ?? '-'} | ${r.failedChecks.join(', ') || '-'} | ${cell(note)} |`;
  }),
  '',
  'Verständlichkeit der Erklärungen: Stichprobe von Hand in der JSON-Datei (Feld `code`).',
  '',
].join('\n');
writeFileSync(new URL(`${base}.md`, dir), md);

console.log(`\nBestanden ${summary.passed}/${summary.runs}, erster Versuch ${summary.firstAttempt}, Fehler ${summary.errors}`);
console.log(`Ergebnis: apps/api/eval/results/${base}.md und .json`);
