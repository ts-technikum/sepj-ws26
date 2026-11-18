// Wählt den LLM-Adapter anhand der Umgebung.
//   LLM_PROVIDER=mock       (Standard) feste Antworten, kein Netz
//   LLM_PROVIDER=anthropic  Claude Haiku 5.5, braucht ANTHROPIC_API_KEY
//   LLM_EFFORT=low|medium|high   nur für anthropic, Standard medium

import { createMockAdapter } from './adapters/mock.mjs';
import { createAnthropicAdapter } from './adapters/anthropic.mjs';

export async function createLlmFromEnv(env = process.env) {
  const provider = (env.LLM_PROVIDER || 'mock').toLowerCase();
  if (provider === 'mock') return createMockAdapter();
  if (provider === 'anthropic') {
    return createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY, effort: env.LLM_EFFORT || 'medium' });
  }
  throw new Error(`Unbekannter LLM_PROVIDER "${provider}". Erlaubt: mock, anthropic`);
}
