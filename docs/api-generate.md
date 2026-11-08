# Vertrag für `POST /api/generate`

Stand: 08.11.2026, Sprint 3 plus Sandbox-Prototyp, Entwurf von Serhat zur Abstimmung mit Tina.
Implementierung: `apps/api/src/generate/generate.mjs`, Tests: `apps/api/test/generate.test.mjs`.

## Zweck

Die Lehrperson beschreibt frei, welchen Algorithmus oder welche Datenstruktur sie sehen möchte, und gibt optional eigene Daten an. Das Backend lässt daraus vom Modell ein Eingabeobjekt `input` und einen JavaScript-Anweisungsblock erzeugen, der nur die viz-API nutzt, und prüft beides. Es gibt keinen Pseudocode mehr als Eingabe.

Nach der Prüfung führt das Backend den Code in der Sandbox aus (QuickJS in einem `worker_thread`, siehe `architektur-sprint3.md`), baut daraus den Trace und prüft ihn gegen `trace.schema.json`. Die Antwort enthält also einen abspielbaren Trace.

## Anfrage

`Content-Type: application/json`, höchstens 1 MiB.

```json
{
  "prompt": "Zeig mir Bubble Sort",
  "data": "5, 3, 8, 1"
}
```

| Feld | Typ | Pflicht | Regeln |
| --- | --- | --- | --- |
| `prompt` | String | ja | Wunsch der Lehrperson, 1 bis 2000 Zeichen |
| `data` | String | nein | eigene Daten als Freitext, höchstens 5000 Zeichen, z. B. `"5, 3, 8, 1"` oder `"A-B, A-C, B-D, Start A"` |

Andere Felder werden mit 400 abgelehnt. Das alte Feld `pseudocode` gibt es nicht mehr.

`data` ist bewusst Freitext. Weil Algorithmen nicht vordefiniert sind, entscheidet das Modell, welche Form von `input` zum Wunsch passt, und übernimmt die Daten der Lehrperson in diese Form. Das Backend prüft das Ergebnis danach streng (siehe unten).

## Antwort bei Erfolg: `200`, `status: "ok"`

```json
{
  "status": "ok",
  "algorithm": "Bubble Sort",
  "input": { "kind": "array", "values": [5, 3, 8, 1] },
  "inputSource": "user",
  "inputNote": "",
  "code": "const a = [...input.values];\nviz.array('a', a);\n...",
  "trace": {
    "version": "1.0",
    "algorithm": "Bubble Sort",
    "source": "const a = [...input.values];\n...",
    "events": [ { "op": "array", "id": "a", "values": [5, 3, 8, 1], "prev": null, "group": 0 }, "..." ],
    "truncated": false
  },
  "execution": { "enabled": true, "durationMs": 74 },
  "meta": {
    "provider": "anthropic",
    "model": "claude-haiku-5-5",
    "promptVersion": "v1.0",
    "attempts": 1,
    "durationMs": 2140,
    "usage": { "inputTokens": 3120, "outputTokens": 610, "cacheReadTokens": 2900 }
  }
}
```

| Feld | Bedeutung |
| --- | --- |
| `algorithm` | Anzeigename, vom Modell gewählt |
| `input` | geprüftes und normalisiertes Eingabeobjekt, Formen siehe unten |
| `inputSource` | `user`: Daten der Lehrperson übernommen. `example`: keine Daten angegeben, Modell hat ein Beispiel gewählt. Das Frontend soll `example` sichtbar machen. |
| `inputNote` | ein Satz, was mit den Daten passiert ist (z. B. „Die Werte wurden aufsteigend sortiert …“), sonst leer |
| `code` | geprüfter Anweisungsblock, nur zur Anzeige und für die Sandbox |
| `trace` | validierter Trace nach `trace.schema.json`. `source` ist der generierte Code, `step.line` die Zeile des `viz.step`-Aufrufs darin (von der Laufzeit gesetzt). `truncated: true`, wenn das Eventlimit gegriffen hat; dann ist der Trace ein Teilergebnis. |
| `execution` | `enabled` und Dauer der Sandbox in ms |
| `meta` | für Entwicklung, Evaluation und Kostenkontrolle. `provider: "mock"` heißt: keine KI, feste Antworten |

## Antwort bei Rückfrage: `200`, `status: "clarify"`

Wenn der Wunsch mehrdeutig ist, nicht visualisierbar ist oder die Daten nicht passen, kommt kein Code, sondern eine Rückfrage:

```json
{
  "status": "clarify",
  "question": "Soll der Binärbaum aus den Werten aufgebaut oder darin gesucht werden?",
  "meta": { "provider": "anthropic", "model": "claude-haiku-5-5", "promptVersion": "v1.0", "attempts": 1, "durationMs": 900, "usage": { } }
}
```

Das Frontend zeigt die Frage an, die Lehrperson ergänzt ihren Wunsch und schickt eine neue Anfrage. Eine Rückfrage ist kein Fehler, deshalb `200`.

## Formen von `input`

| `kind` | Form | typische Wünsche |
| --- | --- | --- |
| `array` | `{ kind, values: [Zahl oder String, …] }` | Sortieren, Binärbaum oder Heap aus Werten aufbauen |
| `search` | `{ kind, values, target, sorted }` | lineare oder binäre Suche. `sorted` setzt das Backend. |
| `graph` | `{ kind, nodes: [{id, label?}], edges: [{id, from, to, weight?}], directed, start }` | Breitensuche, Tiefensuche, Dijkstra auf einem vorgegebenen Graphen |
| `scalar` | `{ kind, params: { n: 5 } }` | Fakultät, Fibonacci, euklidischer Algorithmus |

Grenzen: 50 Werte, 30 Knoten, 100 Kanten, 10 Parameter, Strings bis 20 Zeichen. Das Backend prüft außerdem, dass Kanten nur vorhandene Knoten verbinden, dass ids eindeutig sind und dass `start` existiert.

Die Form richtet sich danach, was die Lehrperson eingibt, nicht danach, was der Algorithmus intern aufbaut. Beispiel: „Binärbaum aus 8, 3, 10“ ist `array`, der Code baut daraus den Baum über `viz.graph`. „Tiefensuche auf diesem Baum: …“ mit Kanten ist `graph`.

Hinweis zu `scalar`: Das Modell liefert `params` als Liste `[{ "name": "n", "value": 5 }]`, weil Structured Outputs keine Objekte mit frei benannten Schlüsseln erlauben. Das Backend macht daraus `{ "n": 5 }`. Der Code und das Frontend sehen nur die Objektform.

## Fehler

Alle Fehler haben dieselbe Form. Nach außen zeigt die Oberfläche immer `message`, also „Visualisierung gescheitert“. `details` ist für Entwicklung und Debugging.

```json
{
  "error": "GENERATION_FAILED",
  "message": "Visualisierung gescheitert",
  "details": ["input.kind: \"baum\" nicht erlaubt. Erlaubt: array, search, graph, scalar"],
  "meta": { "attempts": 2 }
}
```

| HTTP | `error` | Ursache | Was das Frontend tun kann |
| --- | --- | --- | --- |
| 400 | `INVALID_REQUEST` | Anfrage verletzt die Regeln oben | Eingabe korrigieren |
| 400 | `INVALID_REQUEST` | kein gültiges JSON (vom bestehenden `readJSON`) | Fehler im Client |
| 413 | `INVALID_REQUEST` | Anfrage größer als 1 MiB | Daten kürzen |
| 415 | `INVALID_REQUEST` | falscher Content-Type | Fehler im Client |
| 422 | `GENERATION_FAILED` | Modellantwort auch nach der Korrekturrunde ungültig (kein JSON, falsches `input`, verbotener Code, unbekannte viz-Methode, Syntaxfehler) | „Erneut versuchen“ anbieten |
| 422 | `SANDBOX_RUNTIME_ERROR` | Ausnahme im generierten Code, auch nach der Korrekturrunde | „Erneut versuchen“ anbieten |
| 422 | `SANDBOX_TIMEOUT` | Code läuft länger als 2 s (z. B. Endlosschleife) | „Erneut versuchen“ anbieten |
| 422 | `SANDBOX_MEMORY` | Code braucht mehr als 32 MB | „Erneut versuchen“ anbieten |
| 422 | `TRACE_INVALID` | Trace verletzt das Schema | „Erneut versuchen“ anbieten |
| 500 | `SANDBOX_INTERNAL` | Fehler der Sandbox selbst, keine Korrekturrunde | Fehler im Backend melden |
| 422 | `LLM_REFUSED` | Sicherheitsfilter des Modells hat abgelehnt | Wunsch umformulieren |
| 502 | `LLM_TRUNCATED` | Antwort abgeschnitten | erneut versuchen |
| 502 | `LLM_ERROR` | sonstiger Fehler beim Anbieter | später erneut versuchen |
| 503 | `LLM_UNAVAILABLE` | kein API-Schlüssel, Schlüssel abgelehnt, Anbieter nicht erreichbar | Hinweis an Betreiber |
| 503 | `LLM_RATE_LIMITED` | Anfragelimit des Anbieters | später erneut versuchen |
| 504 | `LLM_TIMEOUT` | Anbieter hat nicht rechtzeitig geantwortet | erneut versuchen |

Das Eventlimit (50 000) ist kein Fehler: Die Antwort ist dann `200` mit `trace.truncated: true`, wie in `interface-contract.md` Abschnitt 6 vorgesehen.

## Korrekturrunde

Ist die Modellantwort ungültig oder scheitert die Ausführung (Laufzeitfehler mit Zeile, Zeitlimit, Speicherlimit, ungültiger Trace), schickt das Backend die konkreten Meldungen zurück an das Modell und fragt einmal erneut (insgesamt höchstens 2 Versuche, `LIMITS.maxAttempts`). Die Meldungen nennen immer die erlaubten Alternativen, wie in `interface-contract.md` Abschnitt 6 vorgesehen. `meta.attempts` zeigt, wie viele Versuche nötig waren. Das ist eine Messgröße für die Prompt-Evaluation.

## Konfiguration des Backends

| Variable | Werte | Standard |
| --- | --- | --- |
| `LLM_PROVIDER` | `mock`, `anthropic` | `mock` |
| `ANTHROPIC_API_KEY` | Schlüssel der Anthropic API | keiner |
| `LLM_EFFORT` | `low`, `medium`, `high` | `medium` |

Das Modell ist fest `claude-haiku-5-5` (Teamentscheidung vom 06.11.2026). `@anthropic-ai/sdk` ist in `apps/api/package.json` eingetragen, wird aber nur bei `LLM_PROVIDER=anthropic` geladen. Tests und Mock laufen ohne Netz und ohne Schlüssel.

Start mit echtem Modell: `apps/api/.env.example` nach `apps/api/.env` kopieren, `ANTHROPIC_API_KEY` eintragen, dann `npm run dev:api`. Die Datei wird beim Start automatisch gelesen (`node --env-file-if-exists`, ab Node 22.9) und steht in `.gitignore`. Den Schlüssel nie committen und nur über einen privaten Kanal weitergeben.

Verbindung prüfen ohne Server: `npm run check:llm` schickt eine Anfrage (Standard: Bubble Sort mit `5, 3, 8, 1`) durch die ganze Kette und zeigt Anbieter, Status, Versuche und Tokens. Eigener Wunsch: `npm run check:llm -- "Breitensuche ab A" "A-B, A-C, B-D"`. Bei einem falschen Schlüssel erscheint `LLM_UNAVAILABLE (503)`.

`GET /api/health` meldet zusätzlich `llmProvider` und `llmModel`, und `executionEnabled` ist jetzt `true`. `llmConnected` ist nur bei einem echten Anbieter `true`.

## Beispiel mit curl

```bash
curl -s -X POST http://127.0.0.1:3001/api/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"Binärbaum aufbauen","data":"8 3 10 1 6"}'
```

## Für Tina: Änderungen im Frontend

- `generateTrace(input)` in `apiClient.js` schickt künftig `{ prompt, data }`.
- `status` auswerten: `ok` (Code und später Trace anzeigen), `clarify` (Frage anzeigen).
- Bei Fehlern `message` anzeigen und `details` ausklappbar für Entwicklung.
- `inputSource: "example"` sichtbar machen, z. B. „Beispieldaten, weil keine angegeben wurden“.
- `trace` direkt an die vorhandene Wiedergabe geben. Bei `trace.truncated` einen Hinweis „Teilergebnis“ zeigen.
- Graph-Events kommen jetzt wirklich vor (z. B. Binärbaum), dafür braucht der Renderer die Graph-Darstellung.
