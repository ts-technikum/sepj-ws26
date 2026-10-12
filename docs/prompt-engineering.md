# Prompt-Engineering-Konzept

## Ziel

Prompts übersetzen Pseudocode und validierte Eingabedaten in Code, der den Visualisierungsvertrag einhält. Die Bewertung erfolgt über Endergebnis und nachvollziehbare Zwischenschritte.

## Fester Promptvertrag

Jede Anfrage enthält in derselben Reihenfolge Rolle und Ziel, Laufzeitvertrag, Visualisierungsvertrag, Eingabevertrag, Schrittvertrag, Sicherheitsvertrag und strukturiertes Ausgabeformat.

Der Laufzeitvertrag definiert JavaScript-Version, erlaubte Sprachmittel und Einstiegspunkt. Der Visualisierungsvertrag enthält API-Signaturen und zulässige Aufrufe. Der Eingabevertrag übergibt das validierte `input`-Objekt. Der Schrittvertrag verlangt für jede relevante Zustandsänderung eine Pseudocode-Zeilennummer und Erklärung. Der Sicherheitsvertrag verbietet externe Bibliotheken, Netzwerk, Dateisystem und DOM.

## Prompttemplate

Der feste Kern weist das Modell an, Pseudocode semantisch zu erhalten, ausschließlich die dokumentierte Laufzeit, `input` und `viz` zu verwenden, keine Eingabewerte zu erfinden und bei Unklarheit eine strukturierte Rückfrage statt Code auszugeben. Das Template wird mit API-Spezifikation, Pseudocode und validierten Daten ergänzt.

## Eingabekategorien

| Kategorie | Nutzereingabe |
|---|---|
| Array | Werte und optionale Ordnung |
| Suche | sortiertes Array und Suchwert |
| Graph | Knoten, Kanten, Startknoten, Gerichtetheit |
| Skalar | einzelne Werte oder Grenzen |

Eine binäre Suche prüft die Sortierung als Vorbedingung. Bei Bäumen muss der Nutzer die gewünschte Bedeutung klarstellen, etwa Darstellung, Aufbau oder Suche.

## Evaluation

Jede Promptversion erhält Version, Änderungsbeschreibung, Datum, Modellkennung und Ergebnisse. Referenzfälle bewerten Einhaltung von Ausgabeformat und erlaubter API, korrekte Eingabedaten, fachlich korrektes Ergebnis, Zwischenschritte, Pseudocode-Zuordnung, Trace-Validität, Rückwärtswiedergabe, Laufzeit, Fehlerrate und Kosten.

Negativfälle umfassen leere Eingaben, Duplikate, unsortierte Daten bei binärer Suche, fehlende Graphknoten und unklaren Pseudocode.
