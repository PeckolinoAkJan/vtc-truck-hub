# VTC Truck Hub Windows-Telemetrieclient

Der .NET-8-Client verlangt beim Start eine Kontoanmeldung, empfängt JSON-Pakete des SCS-Telemetrie-Plugins ausschließlich über `127.0.0.1:35055`, überträgt sie kontogebunden an `/api/v1/telemetry` und puffert fehlgeschlagene Pakete lokal für die automatische Nachsynchronisierung.

Umgebungsvariablen:

- Server-URL: fest `https://vtc-truck-hub.de`
- persönlicher Telemetrieschlüssel: nach Google-, Steam-, Discord- oder Passwort-Anmeldung automatisch erzeugt und per Windows-DPAPI geschützt gespeichert
- Speditionen und Rollen: nach der Anmeldung sowie danach minütlich automatisch synchronisiert
- lokaler Plugin-Port: `35055`
- Fuhrparkabgleich: erkannte LKW und Auflieger werden anhand der SCS-Konfiguration und des Kennzeichens einmalig mit der Fahrzeugakte der Spedition gekoppelt
- Sperrwarnung: bei Wartung, Defekt, Außerbetriebnahme oder fremder Reservierung erscheinen ein roter Hinweis, ein Windows-Warnton und optional eine deutsche Sprachansage

Start: `dotnet run --project ConvoyHub.Client`

Das native SCS-Plugin wird gegen das offizielle SCS Telemetry SDK gebaut und sendet die gelieferten Fahrzeug-, Auftrag- und Positionsdaten als JSON an den lokalen UDP-Port. Die beim Client-Build erzeugte 64-Bit-DLL wird vom Installer mitgeliefert und kann vom Client in die ETS2-/ATS-Pluginordner installiert oder repariert werden.
