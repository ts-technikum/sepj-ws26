# Projektstruktur und Arbeitsweise

## Repository-Konventionen

Die Anwendung wird als Monorepo geführt. Anwendungen, gemeinsame Verträge, Tests und Dokumentation liegen gemeinsam im Repository.

| Bereich | Inhalt |
|---|---|
| `apps/web` | Benutzeroberfläche, Eingabeformulare, Canvas und Wiedergabe |
| `apps/api` | LLM-Gateway, Prompt Builder, Prüfung und Sandbox-Anbindung |
| `packages/trace-schema` | Trace-Typen, JSON-Schema und Validator |
| `packages/visualization-api` | API-Vertrag für generierten Code |
| `tests` | Referenzfälle, Integrations- und End-to-End-Tests |
| `docs` | Anforderungen, Architektur und Prompt-Experimente |

## Rollen

Jedes Teammitglied übernimmt mindestens zwei Rollen, darunter mindestens eine technische. Der vorgeschlagene Zuschnitt lautet: LLM-Pipeline und Requirements Engineering; Frontend und Canvas Renderer; Trace-Bibliothek, Sandbox und Quality Assurance; Projektmanagement, Testing und Deployment.

## Erste Arbeitspakete

1. Anforderungen mit dem Betreuer bestätigen und als User Stories erfassen.
2. `viz`-API und Trace-JSON-Schema konkretisieren.
3. Canvas-Renderer mit handgeschriebenem Referenztrace umsetzen.
4. Prompttemplate und strukturierte Modellantwort implementieren.
5. Sandbox-Strategie validieren und Fehlerpfade testen.
6. Alle Referenzfälle durch die vollständige Pipeline führen.

## Definition of Done

Ein Arbeitspaket ist abgeschlossen, wenn Anforderungen und Akzeptanzkriterien dokumentiert sind, Tests die Kernfälle abdecken, die Änderung im Review nachvollziehbar ist und Schnittstellendokumentation aktualisiert wurde.
