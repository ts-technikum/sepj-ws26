# AI-Based Visualization of Algorithms

Webanwendung, die Algorithmen für den Unterricht schrittweise visualisiert. Projekt sepj-ws26 an der FH Technikum Wien.

## Ziel

Die Lehrperson beschreibt frei, was sie sehen möchte („Zeig mir Bubble Sort“), und gibt optional eigene Daten an („5, 3, 8, 1“). Ein Sprachmodell (Claude Haiku 5.5) erzeugt daraus ein Eingabeobjekt und JavaScript-Code, der nur die `viz`-API benutzt. Das Backend prüft beides, führt den Code in einer Sandbox (QuickJS im Worker) aus und baut daraus einen validierten Trace, den das Frontend vorwärts und rückwärts abspielt. Algorithmen sind nicht vordefiniert. Bei unklaren Wünschen kommt eine Rückfrage, bei Fehlern „Visualisierung gescheitert“.

## Schnellstart

Voraussetzung: Node.js 22.9 oder neuer.

```bash
npm install
npm test            # alle Tests
npm run dev:api     # Backend auf http://127.0.0.1:3001
npm run dev:web     # Frontend (zweites Terminal)
```

Ohne weitere Einstellung läuft das Backend mit einem Mock ohne KI. Für das echte Modell `apps/api/.env.example` nach `apps/api/.env` kopieren und den eigenen API-Schlüssel eintragen. Den Schlüssel nie committen.

```bash
npm run check:llm   # eine Anfrage durch die ganze Kette
npm run eval        # Prompt-Evaluation mit 26 Testfällen
```

Unter Windows-PowerShell `npm.cmd` statt `npm` verwenden, falls Skripte blockiert sind. Betrieb mit Docker: siehe [Deployment](docs/deployment.md).

## Struktur

| Ordner | Inhalt |
| --- | --- |
| `apps/web` | React-Frontend, Canvas-Renderer, Wiedergabe |
| `apps/api` | HTTP-API, Prompt, LLM-Adapter, Prüfungen, Sandbox, Evaluation |
| `packages/trace-schema` | Trace-Schema, Vokabular, Validator |
| `packages/visualization-api` | `viz`-Laufzeit, die Aufrufe als Events aufzeichnet |

## Dokumentation

- [Architektur, Stand Sprint 3](docs/architektur-sprint3.md)
- [Schnittstelle `POST /api/generate`](docs/api-generate.md)
- [System-Prompt v1 und Evaluation](docs/prompt-v1.md)
- [Schnittstellenvertrag viz-API und Trace](docs/interface-contract.md)
- [Deployment](docs/deployment.md)
- [Projektstruktur und Arbeitsweise](docs/project-setup.md)
- Ältere Stände: [Architektur mit Pseudocode](docs/architecture.md), [Prompt-Konzept mit Pseudocode](docs/prompt-engineering.md), [Frontend Sprint 1](docs/frontend-sprint1.md), [Integration Sprint 2](docs/integration-sprint2.md)

## Verlauf

### Sprint 1: Frontend-Prototyp

Der erste Frontend-Prototyp wurde mit React und Vite umgesetzt.

Das Frontend visualisiert einen vordefinierten Bubble-Sort-Trace
über einen Canvas-Renderer. Eine Backend-Anbindung ist noch nicht
vorhanden.

### Start

cd apps/web
npm install
npm run dev

Weitere Informationen:
[Frontend Sprint 1](docs/frontend-sprint1.md)

### Sprint 2: HTTP-API und Frontend-Integration

Es gibt nun ein ausführbares Node.js-Backend (`apps/api`) mit `/api/health`,
`/api/traces/validate` und einem ausdrücklich noch nicht implementierten
`/api/generate`-Endpunkt. Das React-Frontend kann die API-Verfügbarkeit anzeigen
und den geladenen Trace gegen das gemeinsame Schema auf dem Server validieren.

Nach `npm install` in **zwei Terminals** starten:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Tests: `npm test`. Details, API-Vertrag und Review-Abgrenzung:
[Integrationsstand Sprint 2](docs/integration-sprint2.md).

Damals noch ohne LLM und Sandbox; beides kam in Sprint 3 dazu.

### Sprint 3: KI, Sandbox, Evaluation

`POST /api/generate` mit System-Prompt v1, Anthropic- und Mock-Adapter, Eingabe- und Codeprüfung, Korrekturrunde, Sandbox und Trace. Erste Evaluation mit Claude Haiku 5.5 am 08.11.2026: 26 von 26 Fällen bestanden. Docker-Image und Anfragelimit für den Betrieb.
