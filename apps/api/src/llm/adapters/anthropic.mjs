// Adapter für Claude Haiku 5.5 über die Anthropic API.
//
// Das SDK wird erst beim Erzeugen des Adapters geladen, damit Tests und der
// Mock-Betrieb ohne Paket und ohne API-Schlüssel laufen.
// Installation, sobald ein Schlüssel vorhanden ist:
//   npm install @anthropic-ai/sdk -w @sepj/api

import { LlmError } from '../errors.mjs';
import { RESPONSE_SCHEMA } from '../responseSchema.mjs';

// Teamentscheidung 06.11.2026: ausschließlich Claude Haiku 5.5.
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';

export async function createAnthropicAdapter({ apiKey, effort = 'medium', timeoutMs = 60_000 } = {}) {
  if (!apiKey) throw new LlmError('LLM_UNAVAILABLE', 'ANTHROPIC_API_KEY ist nicht gesetzt');

  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch (cause) {
    throw new LlmError('LLM_UNAVAILABLE', 'Paket @anthropic-ai/sdk fehlt: npm install @anthropic-ai/sdk -w @sepj/api', { cause });
  }
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });

  return {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,

    /**
     * Ein Modellaufruf. messages ist die bisherige Unterhaltung im Format der
     * Messages API. Rückgabe: Antworttext (JSON nach RESPONSE_SCHEMA), der
     * unveränderte Inhalt für die nächste Runde und die Tokenzahlen.
     */
    async complete({ system, messages }) {
      let response;
      try {
        response = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 16000,
          // Der System-Prompt ist für alle Anfragen gleich und wird gecacht.
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages,
          output_config: {
            effort,
            format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
          },
        });
      } catch (err) {
        // Spezifische Klassen zuerst; APIConnectionError ist Unterklasse von APIError.
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          throw new LlmError('LLM_UNAVAILABLE', 'Anthropic API: Schlüssel abgelehnt', { cause: err });
        }
        if (err instanceof Anthropic.RateLimitError) {
          throw new LlmError('LLM_RATE_LIMITED', 'Anthropic API: Anfragelimit erreicht', { cause: err });
        }
        if (Anthropic.APIConnectionTimeoutError && err instanceof Anthropic.APIConnectionTimeoutError) {
          throw new LlmError('LLM_TIMEOUT', 'Anthropic API: Zeitüberschreitung', { cause: err });
        }
        if (err instanceof Anthropic.APIConnectionError) {
          throw new LlmError('LLM_UNAVAILABLE', 'Anthropic API nicht erreichbar', { cause: err });
        }
        if (err instanceof Anthropic.APIError) {
          throw new LlmError('LLM_ERROR', `Anthropic API: HTTP ${err.status}`, { cause: err });
        }
        throw err;
      }

      if (response.stop_reason === 'refusal') {
        throw new LlmError('LLM_REFUSED', `Modell hat abgelehnt (${response.stop_details?.category ?? 'ohne Kategorie'})`);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new LlmError('LLM_TRUNCATED', 'Antwort wurde bei max_tokens abgeschnitten');
      }

      // Haiku 5.5 denkt standardmäßig: Blöcke nach Typ lesen, nicht nach Position.
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return {
        text,
        // Unverändert zurückgeben, auch die thinking-Blöcke (Korrekturrunde).
        assistantContent: response.content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}
