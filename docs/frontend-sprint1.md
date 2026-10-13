# Frontend – Sprint 1

## Ziel und Abgrenzung

FE-01: Startbares React-Frontend unter `apps/web` (Vite, ohne Backend-Abhängigkeit).
FE-02: Einfacher Canvas-Renderer für Array-Events anhand eines handgeschriebenen Bubble-Sort-Traces.
ARCH-01: Integration über den bestehenden Vertrag `docs/interface-contract.md` (Trace-Version 1.0, `events`, `group`, `op`).

## Start

```bash
cd apps/web
npm install
npm run dev
```

Danach die von Vite angezeigte lokale URL öffnen. Für einen Produktionsbuild: `npm run build`.

## Implementierter Funktionsumfang

- Initiales Array, `set`, `swap`, Highlight-Stile und Pointer (Array).
- Navigation vor/zurück, Anfang/Ende und Schrittauswahl per Slider.
- Erklärung und Pseudocode-Zeilennummer je Schritt.
- JSON-Trace als lokale Datei laden (nur einfache Strukturprüfung, **keine Schema-Validierung**).
- Reproduzierbarer Zustand beim Zurückspringen durch Replay aller Events bis zum Zielschritt.

## Grenzen / nächste Schritte

- Graphen, Knoten, Kanten und Skalare werden noch nicht gerendert.
- Keine API-Verbindung, kein LLM, keine Sandbox, keine automatische Trace-Erzeugung.
- Schema-Validierung, vollständige Fehlermeldungen, große Arrays und umfassende Tests stehen aus.
- Die Reihenfolge der Events wird beibehalten; `group` definiert die sichtbaren Schritte.
- Für Produktionsbetrieb muss der Renderer ausschließlich validierte Traces akzeptieren.

## Manuelle Akzeptanztests

1. `npm run dev` startet die Oberfläche.
2. Anfangszustand: `[5, 2, 4, 1]`.
3. Nach dem ersten Swap: `[2, 5, 4, 1]`.
4. Nach dem dritten Swap: `[2, 4, 1, 5]`.
5. Rückwärts und Slider zeigen dieselben Werte und Schrittmarkierungen wie beim Vorwärtslaufen.
6. Ungültige JSON-Datei zeigt eine Fehlermeldung und lässt den letzten Trace bestehen.
