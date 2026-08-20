# VTC Truck Hub SCS-Telemetrieplugin

Das native 64-Bit-Plugin liest Fahrzeug-, Positions-, Auftrags-, Schadens- und Gameplay-Ereignisse aus dem offiziellen SCS Telemetry SDK 1.14 und sendet sie ausschließlich lokal per UDP an `127.0.0.1:35055`.

Es meldet `job.started`, `job.delivered`, `job.cancelled` und beim Herunterfahren `game.exited`. Die stabile Auftragskennung verhindert neue Fahrten beim erneuten Laden desselben Spielauftrags.
