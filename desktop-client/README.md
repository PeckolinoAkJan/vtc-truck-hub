# VTC Truck Hub Windows-Telemetrieclient

Der .NET-8-Client empfängt JSON-Pakete eines SCS-Telemetrie-Plugins ausschließlich über `127.0.0.1:35055`, überträgt sie authentifiziert an `/api/v1/telemetry` und puffert fehlgeschlagene Pakete lokal für die automatische Nachsynchronisierung.

Umgebungsvariablen:

- `CONVOYHUB_API` – vollständige Telemetrie-URL
- `CONVOYHUB_TELEMETRY_KEY` – serverseitig vergebener API-Schlüssel
- `CONVOYHUB_PLUGIN_PORT` – lokaler UDP-Port, Standard `35055`

Start: `dotnet run --project ConvoyHub.Client`

Das native SCS-Plugin wird gegen das offizielle SCS Telemetry SDK gebaut und sendet die gelieferten Fahrzeug-, Auftrag- und Positionsdaten als JSON an den lokalen UDP-Port. SDK-Dateien und kompilierte DLLs werden aus Lizenz- und Sicherheitsgründen nicht im Webprojekt mitgeliefert.
