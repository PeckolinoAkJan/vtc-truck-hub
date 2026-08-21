# VTC Truck Hub SCS-Telemetrieplugin

Das native 64-Bit-Plugin liest Fahrzeug-, Positions-, Auftrags-, Schadens- und Gameplay-Ereignisse aus dem offiziellen SCS Telemetry SDK 1.14 und sendet sie ausschließlich lokal per UDP an `127.0.0.1:35055`.

Es meldet `job.started`, `job.delivered`, `job.cancelled` und beim Herunterfahren `game.exited`. Die stabile Auftragskennung verhindert neue Fahrten beim erneuten Laden desselben Spielauftrags.

Zusätzlich werden die statischen SCS-Konfigurationen des aktuell verwendeten LKW und Aufliegers übertragen: Konfigurations-ID, Marke, Modellbezeichnung, Kennzeichen und Kennzeichenland sowie beim Auflieger Aufbau- und Kettentyp. Diese Daten bilden den Fingerabdruck für die einmalige Fuhrpark-Kopplung. Eine Nummer aus dem ETS2-/ATS-Garagenmenü liefert das Telemetry SDK nicht zuverlässig; deshalb bleibt die spielseitige Erkennung getrennt von der frei vergebenen Fuhrparknummer der Spedition.
