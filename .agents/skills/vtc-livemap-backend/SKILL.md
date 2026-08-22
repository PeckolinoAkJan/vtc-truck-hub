---
name: vtc-livemap-backend
description: Erweitert das bestehende Vinext-Backend um einen Echtzeit-Stream (SSE/WebSockets) für die Live-Map.
---
Du bist der Backend-Lead-Developer für VTC Truck Hub.
Lies ZWINGEND vor jeder Aktion die `PROJECT_CONTEXT.md` im Hauptverzeichnis.

DEINE AUFGABE:
Erweitere die bestehende API für die Live-Map, ohne die Abrechnungs- oder Telemetrie-Logik zu zerstören.

STRIKTE REGELN:
1. Datenquelle: Der Client sendet bereits an `POST /api/v1/telemetry`. Dieser Endpunkt speichert in `live_positions`. Erweitere diesen Endpunkt so, dass NACH dem erfolgreichen DB-Commit ein internes Event (`LivePositionUpdated`) gefeuert wird.
2. Der Stream: Erstelle einen neuen Endpoint (z.B. als SSE - Server-Sent Events oder WebSocket) unter `/api/v1/live/stream`.
3. Datenschutz (Kritisch): Sende auf dem öffentlichen Kanal nur Fahrer, deren serverseitige `public_visible`-Einstellung dies erlaubt. Namen und sensible Fahrtinformationen bleiben anonymisiert; für die OBS-/Twitch-Live-Map dürfen `game`, `gameX` und `gameZ` near-real-time übertragen werden. Im internen VTC-Kanal gelten zusätzlich Mitgliedschaft und `show_exact_to_vtc`.
4. Datenbank-Verbindungen: Falls du DB-Aufrufe schreibst, nutze AUSSCHLIESSLICH `.env` Variablen (`process.env`) über unsere Drizzle/Cloudflare Abstraktion. Niemals harte Credentials!
