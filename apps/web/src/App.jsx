import React from "react";
import { useMemo, useState } from 'react';
import ArrayCanvas from './ArrayCanvas.jsx';
import { demoTrace } from './demoTrace.js';
import { getSteps, stateAt } from './tracePlayback.js';
export default function App() {
  const [trace, setTrace] = useState(demoTrace);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const steps = useMemo(() => getSteps(trace), [trace]);
  const current = useMemo(() => stateAt(steps, position), [steps, position]);
  const arrays = Object.entries(current.arrays);
  function loadTrace(event) {
    const file = event.target.files?.[0]; if (!file) return;
    file.text().then(text => {
      const parsed = JSON.parse(text);
      if (parsed.version !== '1.0' || !Array.isArray(parsed.events)) throw new Error('Trace benötigt version 1.0 und events-Array');
      if (parsed.events.some(e => !Number.isInteger(e.group) || e.group < 0 || typeof e.op !== 'string')) throw new Error('Ungültige Event-Gruppe oder Operation');
      setTrace(parsed); setPosition(0); setError('');
    }).catch(e => setError(`Trace konnte nicht geladen werden: ${e.message}`));
    event.target.value = '';
  }
  return <main className="shell">
    <header><span className="eyebrow">SE Projekt · Sprint 1 · Frontend-Prototyp</span><h1>Algorithmusvisualisierung</h1><p>Schrittweise Darstellung eines Algorithmus anhand eines Referenz-Traces – ohne Backend.</p></header>
    <section className="panel"><div className="topline"><div><h2>{trace.algorithm || 'Unbenannter Algorithmus'}</h2><p>{trace.source || 'Keine Beschreibung'}</p></div><label className="upload">Trace-JSON laden<input type="file" accept=".json,application/json" onChange={loadTrace}/></label></div>
    {error && <p className="error" role="alert">{error}</p>}
    {trace.truncated && <p className="warning">Der Trace wurde aufgrund eines Limits gekürzt.</p>}
    {arrays.length ? arrays.map(([id, values]) => <div key={id}><h3>Array „{id}“</h3><div className="canvas-wrap"><ArrayCanvas values={values} highlights={current.highlights[id]} pointers={current.pointers[id]}/></div></div>) : <p>Für diesen Schritt ist kein Array definiert. Graphen und Skalare folgen in späteren Sprints.</p>}
    <div className="controls"><button disabled={position <= 0} onClick={() => setPosition(0)}>Zum Anfang</button><button disabled={position <= 0} onClick={() => setPosition(p => p - 1)}>← Zurück</button><strong>Schritt {steps.length ? position + 1 : 0} / {steps.length}</strong><button disabled={position >= steps.length - 1} onClick={() => setPosition(p => p + 1)}>Weiter →</button><button disabled={position >= steps.length - 1} onClick={() => setPosition(steps.length - 1)}>Zum Ende</button></div>
    <input aria-label="Schritt auswählen" className="timeline" type="range" min="0" max={Math.max(0, steps.length - 1)} value={Math.min(position, Math.max(0, steps.length - 1))} onChange={e => setPosition(Number(e.target.value))} disabled={!steps.length}/>
    <div className="explanation"><strong>Erklärung{current.line != null ? ` · Pseudocode-Zeile ${current.line}` : ''}</strong><p>{current.explanation || 'Keine Erklärung für diesen Schritt.'}</p></div>
    </section><footer>Demo mit handgeschriebenem Trace · Keine KI-Generierung oder Sandbox-Ausführung</footer>
  </main>;
}
