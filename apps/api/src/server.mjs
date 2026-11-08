import { createApp } from './app.mjs';
import { createLlmFromEnv } from './llm/index.mjs';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const llm = await createLlmFromEnv();
createApp({ llm }).listen(port, host, () => console.log(`SEPJ API: http://${host}:${port}/api/health (LLM: ${llm.provider}, ${llm.model})`));
