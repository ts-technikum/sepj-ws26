# Deployment

Stand: 08.11.2026, Entwurf von Serhat. Ziel: Die Anwendung ist für Tina, den Betreuer und die Präsentation über eine Adresse im Browser erreichbar, ohne dass jemand einen eigenen API-Schlüssel braucht.

## Aufbau

Ein einziger Dienst: Das Node-Backend (`apps/api`) liefert auch das gebaute Frontend (`apps/web/dist`) aus. Browser und API laufen unter derselben Adresse, das Frontend ruft wie im Entwicklungsmodus `/api/...` auf, CORS ist nicht nötig.

```
Browser ──HTTPS──> Hoster (TLS, Proxy) ──> Container: node apps/api/src/server.mjs
                                             ├─ /            gebautes Frontend
                                             ├─ /api/...     Backend
                                             └─ worker_thread mit QuickJS-Sandbox
                                                    │
                                   API-Schlüssel ───┴──> api.anthropic.com
```

Der API-Schlüssel liegt nur als Umgebungsvariable beim Hoster. Er erreicht nie den Browser und steht nie im Repository.

## Kostenschutz

`/api/generate` ist begrenzt, sobald ein echtes Modell eingestellt ist:

| Grenze | Standard | Variable |
| --- | --- | --- |
| Anfragen pro IP-Adresse und Minute | 10 | `GENERATE_LIMIT_PER_MINUTE` |
| Anfragen pro Tag (UTC) insgesamt | 300 | `GENERATE_LIMIT_PER_DAY` |

Bei Überschreitung antwortet das Backend mit `429 RATE_LIMITED` und `Retry-After`. Der Zähler liegt im Speicher und beginnt bei einem Neustart von vorn. `0` schaltet eine Grenze ab. Zusätzlich sollte in der Anthropic-Konsole ein monatliches Ausgabenlimit gesetzt sein; das ist die eigentliche Obergrenze.

## Umgebungsvariablen

| Variable | Bedeutung | im Betrieb |
| --- | --- | --- |
| `LLM_PROVIDER` | `mock` oder `anthropic` | `anthropic` |
| `ANTHROPIC_API_KEY` | Schlüssel aus der Anthropic-Konsole | als Secret des Hosters |
| `LLM_EFFORT` | `low`, `medium`, `high` | `medium` |
| `PORT` | Port im Container | vom Hoster vorgegeben, sonst `3001` |
| `HOST` | Adresse, auf der gelauscht wird | im Image `0.0.0.0` |
| `TRUST_PROXY` | `1`, wenn ein Proxy des Hosters davor sitzt und `X-Forwarded-For` setzt. Sonst zählt das Limit alle Nutzer als eine IP | `1` bei fast allen Hostern |
| `GENERATE_LIMIT_PER_MINUTE`, `GENERATE_LIMIT_PER_DAY` | siehe oben | Standard reicht |
| `STATIC_DIR` | anderer Ordner für das Frontend | im Image nicht nötig |

## Lokal mit Docker

```
docker build -t sepj .
docker run -p 3001:3001 --env-file apps/api/.env sepj
```

Dann `http://localhost:3001` öffnen. Ohne `--env-file` läuft der Mock. Der Build führt vorher alle Tests aus und bricht ab, wenn einer fehlschlägt.

Ohne Docker geht es auch: `npm run build:web`, dann `npm run dev:api`. Das Backend findet `apps/web/dist` selbst.

Geprüft am 08.11.2026 in einem Linux-Container: Build mit 79 von 79 Tests, Image 293 MB, Startseite und `/api/health` erreichbar, Bubble Sort über `/api/generate` mit `200`, dritte Anfrage bei einem Limit von 2 pro Minute mit `429`. Im Leerlauf braucht der Container etwa 16 MB Arbeitsspeicher; pro Anfrage kommt ein Worker mit QuickJS dazu (Speicherlimit 32 MB).

## Wo betreiben

Das Image läuft überall, wo Docker-Container laufen. Noch nicht entschieden, Optionen:

| Option | Vorteil | Nachteil |
| --- | --- | --- |
| Server oder VM der FH | keine Kosten, mit dem Betreuer abgestimmt | muss angefragt werden, Erreichbarkeit von außen klären |
| Hoster, der aus dem Dockerfile baut (z. B. Render, Fly.io, Railway) | Deployment bei jedem Push, HTTPS inklusive | Konto nötig, Preise und Gratis-Kontingente vor der Wahl auf der jeweiligen Seite prüfen |
| eigener Laptop während der Präsentation | ohne Abhängigkeiten | nicht dauerhaft erreichbar, nur als Rückfallebene |

Empfehlung: mit dem Betreuer klären, ob die FH etwas bereitstellt. Für die Präsentation zusätzlich die lokale Variante vorbereiten und das Backup-Video aufnehmen.
