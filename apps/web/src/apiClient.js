
// Einheitliche Schnittstelle zwischen React und Backend.
// Im Entwicklungsmodus leitet Vite /api an Port 3001 weiter.

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('Backend nicht erreichbar. Läuft npm run dev:api?');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload.message ||
      (Array.isArray(payload.errors)
        ? payload.errors.join('; ')
        : '') ||
      `HTTP ${response.status}`;

    const error = new Error(message);
    error.details = Array.isArray(payload.details)
      ? payload.details
      : Array.isArray(payload.errors)
        ? payload.errors
        : [];
    error.code = payload.error || '';
    error.status = response.status;
    throw error;
  }

  return payload;
}

export const getApiHealth = () =>
  request('/api/health');

export const validateTraceOnServer = trace =>
  request('/api/traces/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trace),
  });

export const generateTrace = ({ prompt, data }) =>
  request('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...(data ? { data } : {}),
    }),
  });
