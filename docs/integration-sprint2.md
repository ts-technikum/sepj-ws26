# Sprint 2 – Übergabe und echte Frontend-Backend-Integration (Stand: 06.11.2026)

## Ergebnis (implementiert, nicht nur geplant)

- Node.js-HTTP-Backend unter `apps/api` ohne externes Webframework.
- `GET /api/health`: technische Verfügbarkeit und expliziter Status der noch offenen LLM- und Sandbox-Komponenten.
- `POST /api/traces/validate`: serverseitige Validierung gegen **das vorhandene gemeinsame JSON-Schema** und Ausgabe von Event-/Schrittzahl.
- `POST /api/generate`: explizit als `501 NOT_IMPLEMENTED` gekennzeichneter Integrationspunkt; **keine simulierte KI**.
- Vite-Proxy für `/api`; React-API-Client, Statusprüfung und direkte Trace-Validierung über das Backend.
- Robuste Fehlerantworten (404/405/413/415/422), maximal 1 MiB Request Body und 10.000 Events.
- Sechs neue HTTP-Integrationstests. `node --test`: 39/39 Tests erfolgreich in der Bearbeitungsumgebung.

## Start auf einem Rechner mit Node.js >= 22

Aus dem Projektverzeichnis (zwei Terminals):

```bash
npm install
npm run dev:api
```

```bash
npm run dev:web
```

Dann die von Vite angezeigte lokale URL öffnen (typisch `http://localhost:5173`).

In der Oberfläche auf **„Backend-Verbindung prüfen“** klicken, anschließend **„Trace vom Backend validieren lassen“**. Der vorhandene Referenz-Trace wird über `/api/traces/validate` gesendet und serverseitig geprüft. Der Browser zeigt dann die Event-/Schrittzahl an. Alternativ eigenes JSON hochladen und validieren. Das ist echte HTTP-Kommunikation; es ist noch **keine** KI-Codegenerierung.

### Direkter API-Test

```bash
curl http://127.0.0.1:3001/api/health
npm test
```

## API-Vertrag

`GET /api/health` → `200`:

```json
{"status":"ok","service":"sepj-api","traceVersion":"1.0","llmConnected":false,"executionEnabled":false}
```

`POST /api/traces/validate` mit `Content-Type: application/json` und dem Trace als JSON-Body:

- `200`: `{ "valid": true, "errors": [], "summary": {"eventCount": 2,"stepCount": 1,"traceVersion": "1.0"} }`
- `422`: `{ "valid": false, "errors": ["..."] }` für Schemafehler.
- `413`: Anfrage zu groß, `400`: syntaktisch ungültiges JSON, `415`: falscher Content-Type.

`POST /api/generate` → `501 NOT_IMPLEMENTED`. Die künftige Signatur und das Modellverhalten sind **noch mit Serhat festzulegen**. Nicht ungeprüft generierten Code mit `eval` im HTTP-Prozess ausführen.

## Neue Rollen und Abgrenzung

| Bereich | Verantwortung |
| --- | --- |
| Frontend, Canvas, API-Client und Anzeige der Serverantworten | Tina |
| Infrastruktur-API, gemeinsame Trace-Schnittstelle, HTTP-Tests | gemeinsam / Übergabe von Pascals Backend-Aufgaben |
| LLM-Anbindung, Prompt-Design, Codegenerierung | Serhat |
| Sandbox-Gateway und sichere Code-Ausführung | Serhat, separat zu planen und zu testen |
| Integrationstest, Architekturentscheidungen, Reviews | Tina + Serhat |

## Was im Review ausdrücklich als offen benannt werden sollte

- Es gibt **noch keine LLM-Anbindung** und keine generierte Algorithmusausführung.
- Es gibt **noch keine Sandbox**. Ein LLM-Modell darf niemals ungeprüft im Backendprozess ausgeführt werden.
- Das Frontend unterstützt derzeit hauptsächlich Arrays. Graph-Events können im Trace-Schema korrekt sein, ohne gerendert zu werden.
- Die im Export enthaltenen `node_modules` wurden nicht weiterverwendet: Nach frischem `npm install` auf dem Zielrechner müssen ggf. plattformspezifische Rollup-Pakete installiert werden. In der Prüf-Umgebung konnte wegen fehlendem Linux-Rollup-Binärmodul kein vollständiger Vite-Build verifiziert werden; die Node.js-Tests liefen vollständig erfolgreich.

## Empfohlene nächste Schritte

1. Serhat definiert den `POST /api/generate`-Request/Response-Vertrag inklusive Fehlermeldungen.
2. Sicherheitskonzept für getrennte Code-Ausführung (Prozess-/Containerisolation, Zeit-, CPU-, Speicher- und Eventlimits) abstimmen.
3. Trace der echten Pipeline durch denselben `/api/traces/validate`-Validator schicken; Frontend kann danach ohne weitere Algorithmus-Demos angebunden werden.
4. UI-Integrationstests und Produktionskonfiguration vor dem Deployment ergänzen.
