import React, { useMemo, useState } from 'react';
import ArrayCanvas from './ArrayCanvas.jsx';
import { demoTrace } from './demoTrace.js';
import { getSteps, stateAt } from './tracePlayback.js';
import { generateTrace, getApiHealth, validateTraceOnServer } from './apiClient.js';

export default function App() {
  const [prompt, setPrompt] = useState('Visualisiere Bubble Sort');
  const [data, setData] = useState('5, 3, 8, 1');
  const [trace, setTrace] = useState(demoTrace);
  const [position, setPosition] = useState(0);
  const [traceOrigin, setTraceOrigin] = useState('demo');
  const [inputNote, setInputNote] = useState('');
  const [exampleData, setExampleData] = useState(false);
  const [question, setQuestion] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [generationDetails, setGenerationDetails] = useState([]);
  const [generalError, setGeneralError] = useState('');
  const [apiStatus, setApiStatus] = useState('Noch nicht geprüft');
  const [validation, setValidation] = useState('');
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [checking, setChecking] = useState(false);

  const steps = useMemo(() => getSteps(trace), [trace]);
  const current = useMemo(() => stateAt(steps, position), [steps, position]);
  const arrays = Object.entries(current.arrays);

  async function handleGenerate(event) {
    event.preventDefault();
    if (generating || !prompt.trim()) return;
    setGenerating(true);
    setGenerationError('');
    setGenerationDetails([]);
    setGeneralError('');
    setQuestion('');
    setValidation('');

    try {
      const result = await generateTrace({ prompt: prompt.trim(), ...(data.trim() ? { data: data.trim() } : {}) });
      if (result.status === 'clarify') {
        setQuestion(result.question || 'Bitte beschreibe deinen Wunsch genauer.');
        return;
      }
      if (result.status !== 'ok' || !result.trace || !Array.isArray(result.trace.events)) {
        throw new Error('Das Backend hat keinen gültigen Visualisierungs-Trace geliefert.');
      }
      setTrace(result.trace);
      setTraceOrigin('generated');
      setPosition(0);
      setExampleData(result.inputSource === 'example');
      setInputNote(result.inputNote || '');
    } catch (error) {
      setGenerationError(error.message || 'Visualisierung gescheitert');
      setGenerationDetails(Array.isArray(error.details) ? error.details : []);
    } finally {
      setGenerating(false);
    }
  }

  async function checkBackend() {
    setChecking(true);
    setApiStatus('Prüfung läuft …');
    try {
      const health = await getApiHealth();
      const provider = health.llmConnected ? `KI aktiv (${health.llmProvider || 'verbunden'})` : 'Mock-Modus (keine echte KI)';
      setApiStatus(`Verbunden · Schema ${health.traceVersion} · ${provider}`);
      setGeneralError('');
    } catch (error) {
      setApiStatus('Nicht erreichbar');
      setGeneralError(error.message);
    } finally {
      setChecking(false);
    }
  }

  async function validateCurrentTrace() {
    setValidating(true);
    setValidation('');
    setGeneralError('');
    try {
      const result = await validateTraceOnServer(trace);
      setValidation(`Trace gültig · ${result.summary.eventCount} Events · ${result.summary.stepCount} Schritte`);
    } catch (error) {
      setGeneralError(`Backend-Validierung: ${error.message}`);
    } finally {
      setValidating(false);
    }
  }

  async function loadTrace(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.version !== '1.0' || !Array.isArray(parsed.events)) {
        throw new Error('Trace benötigt version 1.0 und ein events-Array');
      }
      if (parsed.events.some(item => !Number.isInteger(item.group) || item.group < 0 || typeof item.op !== 'string')) {
        throw new Error('Ungültige Event-Gruppe oder Operation');
      }
      setTrace(parsed);
      setTraceOrigin('upload');
      setPosition(0);
      setExampleData(false);
      setInputNote('');
      setQuestion('');
      setGenerationError('');
      setGenerationDetails([]);
      setGeneralError('');
      setValidation('');
    } catch (error) {
      setGeneralError(`Trace konnte nicht geladen werden: ${error.message}`);
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <span className="eyebrow">SE Projekt · KI-gestützte Visualisierung</span>
        <h1>Algorithmusvisualisierung</h1>
        <p>Beschreibe einen Algorithmus, lass ihn generieren und gehe die Visualisierung Schritt für Schritt durch.</p>
      </header>

      <section className="panel generate-panel" aria-labelledby="generate-title">
        <h2 id="generate-title">Visualisierung generieren</h2>
        <p className="muted">Gib einen Wunsch und optional eigene Werte ein. Ohne Werte kann die KI Beispieldaten wählen.</p>
        <form onSubmit={handleGenerate} className="generate-form">
          <label htmlFor="algorithm-prompt">Was möchtest du visualisieren?</label>
          <textarea
            id="algorithm-prompt"
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="z. B. Visualisiere Bubble Sort"
            disabled={generating}
            required
          />
          <label htmlFor="algorithm-data">Daten (optional)</label>
          <input
            id="algorithm-data"
            type="text"
            value={data}
            onChange={event => setData(event.target.value)}
            maxLength={5000}
            placeholder="z. B. 5, 3, 8, 1"
            disabled={generating}
          />
          <div className="form-actions">
            <button type="submit" disabled={generating || !prompt.trim()}>
              {generating ? 'Visualisierung wird generiert …' : 'Visualisierung generieren'}
            </button>
            {generating && <span className="muted" role="status">KI und Sandbox verarbeiten deine Anfrage …</span>}
          </div>
        </form>
        {question && (
          <div className="notice notice-info" role="status">
            <strong>Die KI hat eine Rückfrage:</strong>
            <p>{question}</p>
            <p>Ergänze die Beschreibung oder Daten oben und starte die Generierung erneut.</p>
          </div>
        )}
        {generationError && (
          <div className="notice notice-error" role="alert">
            <strong>{generationError}</strong>
            <p>Überprüfe deine Eingabe und versuche es erneut.</p>
            {generationDetails.length > 0 && (
              <details>
                <summary>Technische Details anzeigen</summary>
                <ul>{generationDetails.map((detail, index) => <li key={index}>{String(detail)}</li>)}</ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="panel api-panel" aria-label="Backend-Integration">
        <div className="topline">
          <div><h2>API-Integration</h2><p>Backend-Status: <strong role="status">{apiStatus}</strong></p></div>
          <div className="api-actions">
            <button type="button" className="button-secondary" onClick={checkBackend} disabled={checking}>
              {checking ? 'Prüfe …' : 'Backend prüfen'}
            </button>
            <button type="button" className="button-secondary" onClick={validateCurrentTrace} disabled={validating}>
              {validating ? 'Validiere …' : 'Trace validieren'}
            </button>
          </div>
        </div>
        {validation && <p className="success" role="status">{validation}</p>}
        {generalError && <p className="error" role="alert">{generalError}</p>}
      </section>

      <section className="panel visualization-panel" aria-labelledby="visualization-title">
        <div className="topline">
          <div>
            <span className="eyebrow">{traceOrigin === 'generated' ? 'KI-Ergebnis' : traceOrigin === 'upload' ? 'Geladener JSON-Trace' : 'Demo-Trace'}</span>
            <h2 id="visualization-title">{trace.algorithm || 'Unbenannter Algorithmus'}</h2>
          </div>
          <label className="upload">Trace-JSON laden
            <input type="file" accept=".json,application/json" onChange={loadTrace} />
          </label>
        </div>

        {exampleData && <p className="notice notice-info">Die KI hat Beispieldaten verwendet, weil keine konkreten Daten angegeben wurden.</p>}
        {inputNote && <p className="muted input-note">{inputNote}</p>}
        {trace.truncated && <p className="notice notice-warning">Teilergebnis: Der Trace wurde wegen eines Limits gekürzt.</p>}

        {arrays.length > 0 ? arrays.map(([id, values]) => (
          <div key={id} className="array-section">
            <h3>Array „{id}“</h3>
            <div className="canvas-wrap">
              <ArrayCanvas values={values} highlights={current.highlights[id]} pointers={current.pointers[id]} />
            </div>
          </div>
        )) : (
          <p className="notice notice-info">
            Dieser Trace enthält im aktuellen Schritt kein darstellbares Array. Graphen und Skalare benötigen einen eigenen Renderer.
          </p>
        )}

        <div className="controls">
          <button type="button" className="button-secondary" disabled={position <= 0} onClick={() => setPosition(0)}>Zum Anfang</button>
          <button type="button" className="button-secondary" disabled={position <= 0} onClick={() => setPosition(value => value - 1)}>← Zurück</button>
          <strong>Schritt {steps.length ? position + 1 : 0} / {steps.length}</strong>
          <button type="button" className="button-secondary" disabled={position >= steps.length - 1} onClick={() => setPosition(value => value + 1)}>Weiter →</button>
          <button type="button" className="button-secondary" disabled={position >= steps.length - 1} onClick={() => setPosition(steps.length - 1)}>Zum Ende</button>
        </div>
        <input
          aria-label="Schritt auswählen"
          className="timeline"
          type="range"
          min="0"
          max={Math.max(0, steps.length - 1)}
          value={Math.min(position, Math.max(0, steps.length - 1))}
          onChange={event => setPosition(Number(event.target.value))}
          disabled={!steps.length}
        />
        <div className="explanation">
          <strong>Erklärung{current.line != null ? ` · Code-Zeile ${current.line}` : ''}</strong>
          <p>{current.explanation || 'Keine Erklärung für diesen Schritt.'}</p>
        </div>
      </section>
      <footer>Visualisierung anhand von Trace-Events · Generierter Code wird nur im Backend ausgeführt.</footer>
    </main>
  );
}
