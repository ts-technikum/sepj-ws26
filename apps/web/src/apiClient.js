// Einheitliche Schnittstelle zwischen React und dem Backend.
// Im Entwicklungsmodus leitet Vite /api an Port 3001 weiter.
async function request(path, options = {}) {
  let response;
  try { response = await fetch(path, options); }
  catch { throw new Error('Backend nicht erreichbar. Läuft npm run dev:api?'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.errors?.join('; ') || payload.message || `HTTP ${response.status}`);
  return payload;
}
export const getApiHealth = () => request('/api/health');
export const validateTraceOnServer = trace => request('/api/traces/validate', {
  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(trace)
});
// Die LLM-Pipeline wird hier später integriert, nicht durch einen Dummy ersetzt.
export const generateTrace = input => request('/api/generate', {
  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(input)
});
