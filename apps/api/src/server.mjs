import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createLlmFromEnv } from './llm/index.mjs';
import { createStaticHandler } from './static.mjs';
import { createRateLimiter } from './rateLimit.mjs';

const env = process.env;
const port = Number(env.PORT || 3001);
const host = env.HOST || '127.0.0.1';
const llm = await createLlmFromEnv();

// Gebautes Frontend: STATIC_DIR oder, falls vorhanden, apps/web/dist.
const defaultDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const staticDir = env.STATIC_DIR || (existsSync(defaultDist) ? defaultDist : null);
const serveStatic = staticDir ? createStaticHandler(staticDir) : undefined;

// Limit nur mit echtem Modell, außer es ist ausdrücklich gesetzt. 0 = aus.
const limitOn = env.GENERATE_LIMIT_PER_MINUTE !== undefined || env.GENERATE_LIMIT_PER_DAY !== undefined || llm.provider !== 'mock';
const rateLimit = limitOn
  ? createRateLimiter({ perMinute: Number(env.GENERATE_LIMIT_PER_MINUTE ?? 10), perDay: Number(env.GENERATE_LIMIT_PER_DAY ?? 300) })
  : undefined;

createApp({ llm, serveStatic, rateLimit, trustProxy: env.TRUST_PROXY === '1' }).listen(port, host, () => {
  console.log(`SEPJ API: http://${host}:${port}/api/health (LLM: ${llm.provider}, ${llm.model})`);
  console.log(`Frontend: ${staticDir ? `http://${host}:${port}/ aus ${staticDir}` : 'nicht ausgeliefert (kein Build gefunden)'}`);
  console.log(`Anfragelimit /api/generate: ${rateLimit ? `${env.GENERATE_LIMIT_PER_MINUTE ?? 10} pro Minute und IP, ${env.GENERATE_LIMIT_PER_DAY ?? 300} pro Tag` : 'aus'}`);
});
