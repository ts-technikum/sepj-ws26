# Schnittstellenvertrag

Verbindliche Absprache zwischen den drei Komponenten des Projekts.

Dieses Dokument ist gleichzeitig die Vorlage für das Prompt-Design und die
Vorgabe, gegen die Renderer und Ausführung unabhängig voneinander entwickelt
werden können.

Stand: Sprint 1, Version 1.0 des Trace-Formats. Angepasst am 08.11.2026 an den
Ansatz ohne Pseudocode (freier Wunsch der Lehrperson, siehe `api-generate.md`):
Bedeutung von `line` und `source`, Zuständigkeiten, offene Punkte. Das
Trace-Format selbst ist unverändert. Jede Änderung hier betrifft alle
Teilbereiche und muss im Team abgestimmt werden.

| Bereich | Zuständig | Liest diesen Vertrag als |
| --- | --- | --- |
| LLM-Pipeline | Serhat | Vorgabe, was in den Prompt gehört |
| Ausführung und Sandbox | Serhat (bis 11/2026 Pascal) | Vorgabe, was die Laufzeit bereitstellt |
| Renderer und Oberfläche | Tina | Vorgabe, was anzuzeigen ist |

## 1. Was das Modell liefern muss

Das Modell liefert **einen Anweisungsblock**, keine Funktionsdeklaration, kein
Modul, keinen Export. Dieser Block wird von der Laufzeit mit genau zwei
Variablen im Gültigkeitsbereich ausgeführt:

```javascript
const a = [...input.values];
viz.array('a', a);

for (let i = 0; i < a.length - 1; i++) {
  // ...
}
```

Verfügbar sind ausschließlich:

- **`input`** — die validierten Eingabedaten
- **`viz`** — die Visualisierungs-API aus Abschnitt 2

Alles andere ist verboten: `require`, `import`, `fetch`, `XMLHttpRequest`,
`process`, Dateisystem, DOM, Timer, `eval`. Das Backend lehnt Code mit diesen
Bezeichnern vor der Ausführung ab (`checkCode.mjs`, die Meldung geht in die
Korrekturrunde). Unabhängig davon stellt die Sandbox (QuickJS im Worker) diese
Funktionen gar nicht bereit.

Das Modell darf den Zustand in eigenen Variablen führen — im Beispiel oben das
Array `a`. Es muss jede für die Darstellung relevante Änderung zusätzlich über
`viz` melden.

## 2. Die viz-API

### Deklaration

Legt eine Struktur an. Wird eine bereits vorhandene `id` erneut deklariert,
ersetzt das die Struktur vollständig.

| Aufruf | Bedeutung |
| --- | --- |
| `viz.array(id, values)` | Array anlegen oder ersetzen |
| `viz.graph(id, {nodes, edges, directed})` | Graph oder Baum anlegen |
| `viz.scalar(id, value)` | Einzelwert, etwa Zähler, `min`, `pivot` |

`nodes` ist eine Liste von `{id, label?, state?}`, `edges` eine Liste von
`{id, from, to, weight?, state?}`. `directed` ist standardmäßig `false`.

### Zustandsänderung

| Aufruf | Bedeutung |
| --- | --- |
| `viz.set(id, index, value)` | Element überschreiben |
| `viz.swap(id, i, j)` | zwei Elemente tauschen |
| `viz.setScalar(id, value)` | Einzelwert ändern |
| `viz.nodeState(id, nodeId, state)` | Knotenzustand setzen |
| `viz.edgeState(id, edgeId, state)` | Kantenzustand setzen |

### Hervorhebung

Rein visuell, verändert keinen Zustand. Gilt nur für den Schritt, in dem sie
aufgerufen wird.

| Aufruf | Bedeutung |
| --- | --- |
| `viz.highlight(id, target, style)` | Elemente oder Bereich hervorheben |
| `viz.pointer(id, name, index)` | benannter Zeiger, etwa `i`, `j`, `mid` |

`target` hat genau eine von zwei Formen:

```javascript
{ indices: [3, 4] }     // einzelne Elemente
{ range: [2, 7] }       // zusammenhängender Bereich, beide Grenzen einschließlich
```

Der Name bei `pointer` ist frei wählbar und wird als Beschriftung angezeigt.

### Schrittgrenze

| Aufruf | Bedeutung |
| --- | --- |
| `viz.step({line, explanation})` | schließt den aktuellen Schritt ab |

`explanation` ist ein kurzer Satz in der Sprache des Nutzers mit konkreten
Werten und der didaktische Kern jedes Schritts. Das Modell setzt nur
`explanation`.

`line` setzt die Laufzeit selbst: Es ist die 1-basierte Zeile des
`viz.step`-Aufrufs im generierten Code (`trace.source`). Ein vom Modell
gesetztes `line` wird ignoriert. Früher war `line` die Zeile im eingegebenen
Pseudocode; den gibt es seit Sprint 3 nicht mehr.

## 3. Festes Vokabular

Diese Listen gelten verbindlich. Jeder andere Wert wird abgelehnt.

### Knotenzustände

| Wert | Bedeutung |
| --- | --- |
| `default` | unberührt |
| `active` | wird gerade bearbeitet |
| `frontier` | bekannt, aber noch nicht bearbeitet (Warteschlange, Stapel) |
| `visited` | fertig bearbeitet |

### Kantenzustände

| Wert | Bedeutung |
| --- | --- |
| `default` | unberührt |
| `active` | wird gerade betrachtet |
| `tree` | gehört zum Durchlaufbaum |
| `rejected` | betrachtet und verworfen, führt zu bereits Besuchtem |

### Hervorhebungsstile

| Wert | Bedeutung |
| --- | --- |
| `compare` | Elemente werden verglichen |
| `active` | aktuelles Element |
| `swap` | gerade getauscht |
| `sorted` | endgültig an seinem Platz |
| `range` | aktueller Suchbereich |
| `excluded` | aus der Suche ausgeschlossen |

Das Vokabular ist bewusst klein gehalten und kann erweitert werden. Jeder neue
Wert braucht dann gleichzeitig eine Darstellung im Renderer und einen Eintrag
im Prompt.

## 4. Der Trace

Der generierte Code zeichnet nie selbst. Er ruft nur die API auf, und die
Laufzeit zeichnet die Aufrufe als Liste von Events auf. Diese Liste ist die
Schnittstelle zum Renderer.

```json
{
  "version": "1.0",
  "algorithm": "Bubble Sort",
  "source": "const a = [...input.values];\n...",
  "events": [ ... ],
  "truncated": false
}
```

Der Rahmen wird vom Backend ergänzt, nicht vom generierten Code (`buildTrace`
in `generate.mjs`). `algorithm` ist der vom Modell gewählte Anzeigename,
`source` der generierte Code, auf den sich `step.line` bezieht.
`truncated` ist `true`, wenn ein Limit aus Abschnitt 6 gegriffen hat.

### Event-Typen

Jedes Event trägt ein `op` und ein `group`. Die Schrittnummer `group` sagt,
zu welchem Schritt das Event gehört.

| `op` | Felder | Verändert Zustand |
| --- | --- | --- |
| `array` | `id`, `values`, `prev` | ja |
| `graph` | `id`, `nodes`, `edges`, `directed` | ja |
| `scalar` | `id`, `value`, `prev` | ja |
| `set` | `id`, `index`, `value`, `prev` | ja |
| `swap` | `id`, `i`, `j` | ja |
| `setScalar` | `id`, `value`, `prev` | ja |
| `nodeState` | `id`, `nodeId`, `state`, `prev` | ja |
| `edgeState` | `id`, `edgeId`, `state`, `prev` | ja |
| `highlight` | `id`, `target`, `style` | nein |
| `pointer` | `id`, `name`, `index` | nein |
| `step` | `line`, `explanation` | nein |

Die formale Beschreibung steht in `trace.schema.json` und ist maschinell
prüfbar. Bei Abweichungen zwischen diesem Dokument und dem Schema gilt das
Schema.

## 5. Schritte und Rückwärtsnavigation

### Schritte

`viz.step()` ist ein **Trenner**. Alles, was seit dem letzten `step()`
aufgerufen wurde, gehört zum aktuellen Schritt. Daraus folgt:

- Aufrufe vor dem ersten `step()` landen in Schritt 0. Das ist der richtige
  Ort für die anfängliche Deklaration der Strukturen.
- Ein Schritt kann beliebig viele Events enthalten. Der Nutzer sieht Schritte,
  nicht Events.

### Vorgängerwerte

Jedes zustandsändernde Event führt den vorherigen Wert im Feld `prev` mit. Die
Laufzeit ergänzt ihn automatisch — **das Modell muss sich nicht darum
kümmern**.

Dadurch ist ein Schritt rückwärts eine Umkehrung des Events statt einer
Neuausführung des Algorithmus. `swap` braucht kein `prev`, weil ein Tausch
sein eigenes Gegenstück ist.

### Hervorhebungen beim Zurückgehen

Hervorhebungen und Zeiger werden beim Springen **aus dem Trace rekonstruiert**,
nicht fortgeschrieben. Wer auf Schritt 42 landet, sieht die Markierungen von
Schritt 42 — unabhängig davon, ob er vorwärts, rückwärts oder über die
Zeitleiste dorthin gekommen ist.

### Zugesicherte Eigenschaft

> Vorwärts bis zum Ende und wieder zurück stellt jeden Zwischenzustand exakt
> wieder her, Hervorhebungen eingeschlossen.

Diese Eigenschaft wird für jeden Referenzalgorithmus getestet. Wer ein neues
Event hinzufügt, muss sein Gegenstück für die Rückwärtsrichtung mitliefern,
sonst schlägt der Test an.

## 6. Grenzen und Fehlerfälle

### Harte Grenzen

| Grenze | Vorgabe | Reaktion |
| --- | --- | --- |
| Anzahl Events | 50 000 | Abbruch, `truncated: true` |
| Laufzeit | 2 s (QuickJS-Interrupt), harter Abbruch nach weiteren 1,5 s | Abbruch des Workers, `SANDBOX_TIMEOUT` |
| Speicher | 32 MB in QuickJS | Abbruch, `SANDBOX_MEMORY` |

Das Eventlimit fängt Endlosschleifen ab, die zeichnen. Nicht zeichnende
Endlosschleifen fängt das Zeitlimit ab, indem der Worker hart beendet wird.

### Fehlerfälle

Ein Fehlschlag ist bei modellgeneriertem Code der Normalfall, nicht die
Ausnahme. Nach außen zeigt die Oberfläche eine einzige Meldung —
**„Visualisierung gescheitert"** — intern werden die Fälle unterschieden,
weil sie verschiedene Folgen haben:

| Fall | Ursache | Was danach passiert |
| --- | --- | --- |
| Syntaxfehler | Code nicht lauffähig | Meldung zurück in den nächsten Prompt |
| Vertragsverletzung | unbekannter Aufruf oder Wert | Meldung zurück in den nächsten Prompt |
| Laufzeitfehler | Ausnahme im Algorithmus | Meldung anzeigen, ggf. erneut anfragen |
| Zeitüberschreitung | Lauf zu lang | abbrechen, Nutzer informieren |
| Eventlimit | zu viele Zeichenbefehle | Teilergebnis anzeigen |
| Ungültiger Trace | Schema nicht erfüllt | Meldung zurück in den nächsten Prompt |

Die ersten beiden und der letzte Fall lassen sich durch besseres Prompting
beheben. Deshalb sind sie getrennt und deshalb enthalten ihre Meldungen immer
die erlaubten Alternativen:

```
.style: "blinkend" nicht erlaubt. Erlaubt: compare, active, swap, sorted, range, excluded
```

## 7. Validierung

Ein Trace wird vor der Anzeige gegen `trace.schema.json` geprüft. Die Prüfung
läuft ohne externe Abhängigkeiten; in der CI kann zusätzlich `ajv` gegen
dieselbe Schemadatei laufen.

Das Vokabular steht sowohl in `vocabulary.mjs` als auch im Schema. Ein Test
vergleicht beide und schlägt an, sobald sie auseinanderlaufen.

## 8. Offene Punkte

- ~~Form von `input`~~: festgelegt in `api-generate.md` (`array`, `search`,
  `graph`, `scalar`, mit Grenzen), geprüft von `validateInput.mjs`.
- ~~Rahmen des Trace~~: ergänzt das Backend, siehe Abschnitt 4.
- **Tiefensuche.** Der Zustand „liegt auf dem Stapel, wir sind aber schon
  tiefer" wird derzeit über `frontier` abgebildet. Falls das in der Darstellung
  nicht reicht, braucht es einen eigenen Wert.
- **Insertion Sort.** Für das herausgenommene Element, das gerade keinen Platz
  hat, gibt es keinen eigenen Stil; `active` muss vorerst genügen.

## 9. Änderungen an diesem Vertrag

Eine Änderung betrifft immer mindestens zwei der drei Komponenten. Deshalb:

1. Änderung im Team besprechen, nicht einseitig umsetzen.
2. Schema, `vocabulary.mjs` und dieses Dokument gemeinsam anpassen.
3. Prompt nachziehen.
4. Renderer um die Darstellung ergänzen.
5. Referenzalgorithmen erneut durchlaufen lassen.

Die Version des Trace-Formats wird erhöht, sobald eine Änderung bestehende
Traces ungültig macht.
