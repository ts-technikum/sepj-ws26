# AI-Based Visualization of Algorithms

Webanwendung zur schrittweisen Visualisierung von Algorithmen aus Pseudocode.

## Ziel

Lehrende geben Pseudocode und Daten ein. Ein Sprachmodell erzeugt instrumentierten JavaScript-Code in einer begrenzten Laufzeit. Daraus entsteht ein validierter Trace, den ein Canvas-Renderer vorwärts und rückwärts abspielt.

## Dokumentation

- [Architektur und Anforderungen](docs/architecture.md)
- [Prompt-Engineering-Konzept](docs/prompt-engineering.md)
- [Projektstruktur und Arbeitsweise](docs/project-setup.md)

## Geplante Struktur

`apps/web` enthält Frontend und Canvas-Renderer. `apps/api` enthält LLM-Orchestrierung, Validierung und Sandbox-Gateway. `packages/trace-schema` enthält gemeinsame Typen und JSON-Schema. `packages/visualization-api` dokumentiert die `viz.*`-API. `tests` enthält Referenzfälle und Integrations-Tests.

Die Anwendungsordner werden nach Review der Architektur und des Implementierungsplans angelegt.


## Frontend-Prototyp (Sprint 1)

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
