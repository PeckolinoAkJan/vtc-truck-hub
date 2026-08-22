# VTC Truck Hub – Projektkontext und Architekturregeln

> **Status:** Bestandsaufnahme vom 22.08.2026
> **Geltungsbereich:** Webanwendung, Backend/API, Datenhaltung, Supabase-Abgleich, Windows-Desktop-Client, natives SCS-Telemetrieplugin und Discord-Bot.
> **Verbindlichkeit:** Dieses Dokument ist die Architektur-Bibel des Projekts. Änderungen an Datenmodell, Authentifizierung, Telemetrie, Abrechnung oder Live-Map müssen vor der Implementierung gegen die Regeln und Schnittstellen in diesem Dokument geprüft werden.

## 1. Ziel und unverhandelbare Regeln

VTC Truck Hub ist eine mandantenfähige Plattform für virtuelle Speditionen in Euro Truck Simulator 2 (ETS2) und American Truck Simulator (ATS). Das bestehende System umfasst eine React-Webanwendung, serverseitige API-Routen, lokale bzw. produktive Datenadapter, Supabase-Import und -Authentifizierung, einen Windows-Desktop-Client, ein natives SCS-Telemetrieplugin sowie einen Discord-Bot.

Für alle weiteren Entwicklungen gelten diese Regeln:

1. Bestehende Tabellen, API-Verträge, Statuswerte und Client-Flüsse werden erweitert, nicht parallel neu erfunden.
2. Es dürfen keine Demo-Benutzer, Demo-Speditionen, erfundenen Geldbeträge oder künstlichen Telemetriedaten in Produktionspfade gelangen.
3. Jede VTC-gebundene Abfrage und Mutation muss `vtc_id` serverseitig aus einer aktiven Mitgliedschaft oder einer nachgewiesenen Berechtigung ableiten beziehungsweise prüfen.
4. Geheimnisse, Datenbankzugänge und Provider-Schlüssel dürfen nie im Quellcode, Client-Bundle, Repository, Log oder API-Response stehen.
5. **Alle künftigen verbindungsbasierten Datenbankkonfigurationen müssen ausschließlich über `.env`-Variablen und serverseitig über `process.env` bezogen werden.** Keine fest codierten Hosts, Ports, Benutzernamen, Passwörter, Projekt-URLs oder Connection-Strings.
6. Direkte Zugriffe auf `process.env` werden auf die zentrale Laufzeit-/Konfigurationsschicht beschränkt. Fachmodule erhalten eine Datenbankabstraktion und bauen keine eigene Verbindung auf.
7. Das vorhandene Cloudflare-D1-Binding ist eine dokumentierte Übergangsausnahme: Es wird durch die Laufzeit injiziert. Bei Docker, Plesk oder Postgres/Supabase muss dieselbe zentrale Abstraktion ihre Verbindung ausschließlich aus `process.env` erzeugen.
8. Der Desktop-Client vertraut niemals einer frei eingegebenen `userId` oder `vtcId`. Der Server bindet jeden persönlichen Schlüssel an ein Konto und prüft die aktive Mitgliedschaft bei jeder Übertragung.
9. Eine neue Live-Map darf die vorhandenen Tabellen `telemetry`, `telemetry_details`, `live_positions` und `live_map_preferences` sowie `/api/v1/telemetry` und `/api/v1/live` nicht umgehen.
10. Datenbankänderungen erfolgen über versionierte Migrationen. `ensureDatabase()` darf langfristig nicht als zweite, abweichende Schemaquelle weiterwachsen.

## 2. Projektstruktur

```text
Mein Projekt/
├─ app/                         Vinext/React-Seiten, Server Components und API-Routen
│  ├─ api/                      HTTP-Backend
│  │  ├─ auth/                 Web-, OAuth-, Supabase- und Desktop-Anmeldung
│  │  ├─ admin/                Gründer-/Plattformadministration
│  │  └─ v1/                   Fach-API für Client und Weboberfläche
│  ├─ live-map/                öffentliche/interne Live-Map-Oberfläche
│  ├─ dashboard/, fahrtenbuch/ VTC-Module
│  ├─ konto/, admin/, gruender/ Konto- und Verwaltungsoberflächen
│  └─ components/              gemeinsam verwendete UI-Komponenten
├─ lib/
│  ├─ platform.ts              zentrale Laufzeit, SQL-Bootstrap, Session/RBAC/Audit
│  ├─ supabase-auth.ts          Supabase Auth sowie Import-/Verzeichnisabgleich
│  ├─ client-access.ts          kontogebundene persönliche Telemetrieschlüssel
│  ├─ payroll.ts               Abrechnung, Reservierung und Buchung
│  ├─ fleet-compliance.ts       Fuhrparkbindung und Sperrprüfung
│  └─ discord.ts               Discord-API und Einbettungen
├─ db/
│  ├─ schema.ts                Drizzle-SQLite-Schema
│  └─ index.ts                 Drizzle-Adapter für das D1-Binding `DB`
├─ drizzle/                    versionierte SQLite/D1-Migrationen 0000–0018
├─ runtime/node-cloudflare.ts  Plesk/Node-Ersatz für D1 und R2
├─ worker/index.ts             Cloudflare-Worker-Einstieg
├─ desktop-client/
│  ├─ ConvoyHub.Client/        .NET-8-WPF-Client
│  ├─ ConvoyHub.ScsPlugin/     natives 64-Bit-SCS-Telemetrieplugin
│  ├─ scs-sdk/                 offizielles SCS Telemetry SDK und Beispiele
│  └─ installer/               Inno-Setup-Konfiguration
├─ discord-bot/                Node-basierter Discord-Bot
├─ scripts/build-plesk.mjs     Plesk-Standalone-Build
├─ tests/                      Build-/HTML-Prüfungen
├─ .openai/hosting.json        Sites-Bindings `DB` und `UPLOADS`
├─ vite.config.ts              Vinext, Sites und Cloudflare-/Plesk-Adapter
├─ drizzle.config.ts           Drizzle, Dialekt SQLite
├─ package.json                Webprojekt
└─ .env.example                öffentliche Liste benötigter Geheimnisnamen
```

Generierte Verzeichnisse wie `.next`, `.vinext`, `.wrangler`, `dist`, `node_modules` und `desktop-client/**/bin|obj` sind keine Quellcode-Wahrheit und dürfen nicht manuell als Architekturquelle geändert werden.

## 3. Tech-Stack und Laufzeit

### 3.1 Web und Backend

- **Sprache:** TypeScript 5.9
- **UI:** React 19.2
- **Full-Stack-Laufzeit:** Vinext `1.0.0-beta.2`
- **Build:** Vite 8, Vinext, optional Cloudflare-Vite-Plugin
- **Node.js:** mindestens 22.13; Plesk baut einen Standalone-Server
- **ORM/Migrationen:** Drizzle ORM und Drizzle Kit
- **aktueller DB-Dialekt:** SQLite/D1
- **Uploads:** Cloudflare R2 oder dateibasierter Plesk-Adapter
- **Desktop:** .NET 8 WPF, Windows x64
- **Natives Plugin:** C++ gegen das offizielle SCS Telemetry SDK, Ausgabe als `convoyhub_scs.dll`
- **Bot:** Node.js, Discord HTTP/Gateway-Funktionen

### 3.2 Laufzeitmatrix

| Umgebung | Datenbank | Uploads | Konfiguration |
|---|---|---|---|
| Lokale Vinext-/Cloudflare-Entwicklung | lokales Miniflare/D1-Binding `DB` | lokales R2-Binding `UPLOADS` | `.openai/hosting.json`, Vite/Wrangler und `.env` |
| OpenAI Sites/Cloudflare | injiziertes D1-Binding `DB` | injiziertes R2-Binding `UPLOADS` | Plattform-Bindings plus Secrets |
| Plesk/Node | `node:sqlite` über `runtime/node-cloudflare.ts`; Datei `${PLESK_DATA_DIR}/vtc-truck-hub.sqlite` | Dateisystem unter `${PLESK_DATA_DIR}/uploads` | ausschließlich Server-Umgebung/`.env` |
| Supabase | PostgreSQL für Auth und importierten Produktionsbestand | Supabase Storage ist im analysierten Webpfad nicht die primäre Upload-Schicht | `SUPABASE_URL`, Publishable Key und ausschließlich serverseitiger Service-Role-Key |
| Docker | **Im Repository aktuell nicht vorhanden:** kein `Dockerfile`, keine Compose-Datei und kein definierter DB-Container | nicht definiert | muss vor Nutzung explizit ergänzt werden |

Wichtig: Das Projekt besitzt derzeit keine dokumentierbare aktive Docker-Datenbank. Eine zukünftige Compose-Umgebung darf deshalb nicht als bestehend vorausgesetzt werden. Sie muss denselben Datenbankvertrag wie Plesk/Supabase verwenden und darf keine separate, inkompatible Schemawelt eröffnen.

### 3.3 Verbindlicher Umgebungsvariablen-Vertrag

Aktuell verwendete beziehungsweise im Code erwartete Variablen:

```dotenv
# Laufzeit/Datenhaltung
PLESK_DATA_DIR=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OAuth und externe Dienste
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_PUBLIC_KEY=
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=
DISCORD_GUILD_IDS=
STEAM_API_KEY=

# interne Serverkommunikation
BOT_INTERNAL_KEY=
TELEMETRY_API_KEY=
FOUNDER_EMAIL=
CONVOYHUB_API=
```

Für eine künftige Docker-/Postgres-Schicht ist folgender Vertrag vorzusehen:

```dotenv
DATABASE_PROVIDER=postgres
DATABASE_URL=
# Alternativ nur, wenn kein DATABASE_URL verwendet wird:
DATABASE_HOST=
DATABASE_PORT=5432
DATABASE_NAME=
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_SSL=true
```

Regeln dazu:

- `DATABASE_URL` beziehungsweise die Einzelwerte werden ausschließlich serverseitig aus `process.env` gelesen.
- Der Server muss beim Start fehlende Pflichtwerte mit einer klaren Fehlermeldung ablehnen; keine stillen Produktions-Fallbacks.
- `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_PASSWORD`, OAuth-Secrets, Bot-Token und interne Schlüssel dürfen niemals an React-Clientcode oder den Desktop-Client ausgeliefert werden.
- `.env` bleibt ignoriert. `.env.example` enthält nur Namen und ungefährliche Hinweise, niemals echte Werte.
- Die derzeitige `.env.example` ist unvollständig: insbesondere Supabase-, Plesk-, Bot-API- und optionale Mehrserver-Variablen müssen bei der nächsten Konfigurationspflege ergänzt werden.

### 3.4 Datenbankadapter und Schemaquellen

`db/index.ts` erstellt Drizzle aktuell über `drizzle(env.DB)`. `lib/platform.ts` greift zusätzlich direkt auf dieselbe D1-kompatible Schnittstelle zu. Unter Plesk ersetzt der Vite-Alias `cloudflare:workers` durch `runtime/node-cloudflare.ts`. Dieser Adapter implementiert D1 auf Basis von `node:sqlite`, aktiviert WAL, Fremdschlüssel und ein Busy-Timeout und bildet R2 durch Dateien ab.

Aktuell existieren zwei Schemaquellen:

1. `db/schema.ts` plus `drizzle/0000…0018`.
2. 121 `CREATE TABLE IF NOT EXISTS`-Anweisungen in `lib/platform.ts`.

Zusätzlich werden derzeit einige Tabellen nur im Laufzeit-Bootstrap, nicht im Drizzle-Schema beschrieben: `desktop_auth_requests`, `fleet_incidents`, `fleet_policies`, `platform_news`, `platform_wiki_tabs`, `telemetry_details`, `trip_vehicle_usage`, `vehicle_game_bindings`.

**Architekturentscheidung:** Neue Tabellen und Spalten werden zuerst als versionierte Migration und im kanonischen Schema angelegt. `ensureDatabase()` darf nur noch Kompatibilitäts-/Startprüfung und notwendige idempotente Seeds übernehmen. Vor einem Postgres-/Supabase-Wechsel müssen SQLite-spezifische Ausdrücke wie `INSERT OR IGNORE`, `datetime('now', ...)`, `MAX(...)` als Skalarfunktion und `PRAGMA` in einen Datenbankadapter oder Postgres-kompatible SQL-Varianten überführt werden.

## 4. Authentifizierung, Mandanten und Berechtigungen

### 4.1 Websitzung

- Lokale Websitzungen liegen in `sessions`.
- Cookie: `convoy_session`, `HttpOnly`, `SameSite=Lax`, 30 Tage, unter HTTPS zusätzlich `Secure`.
- `getSessionUser()` löst die Sitzung serverseitig auf.
- `requireFounder()` vergleicht die Konto-E-Mail mit `platform_settings.founder_email`, das aus `FOUNDER_EMAIL` initialisiert wird.
- `requireVtcPermission()` prüft aktive Mitgliedschaft, Rollenrechte und zeitlich gültige Delegationen. Das Gründerkonto erhält plattformweit `*`.
- `resolveVtcId()` akzeptiert nur eine aktive Mitgliedschaft und verhindert damit eine freie VTC-Auswahl über Request-Parameter.

### 4.2 Anbieter

- **E-Mail/Passwort:** `/api/auth/login`, PBKDF2-SHA-256 mit 120.000 Iterationen; Sperre nach wiederholten Fehlern; optional TOTP/Wiederherstellungscode.
- **Registrierung:** `/api/auth/register`; Regeln/Datenschutz sind Pflicht. Dabei wird sofort ein persönlicher Clientschlüssel vorbereitet.
- **Supabase Password Auth:** wird vor dem lokalen Passwortpfad versucht. Erfolgreiche Supabase-Konten und Mitgliedschaften werden lokal synchronisiert.
- **Google:** der aktive Startpfad nutzt Supabase OAuth. Ein direkter Google-Callback mit `GOOGLE_CLIENT_ID/SECRET` existiert weiterhin als Alt-/Parallelpfad und darf bei einer Bereinigung nicht versehentlich mit dem Supabase-Callback vermischt werden.
- **Discord:** OAuth2 Authorization Code; verknüpft nach Discord-ID und, falls nötig, bestehender E-Mail.
- **Steam:** OpenID; die Steam-ID wird als verknüpftes Konto gespeichert.

### 4.3 Supabase-Abgleich

`lib/supabase-auth.ts` erfüllt zwei Aufgaben:

1. Authentifizierung und Synchronisierung des aktuell angemeldeten Supabase-Kontos.
2. Serverseitiger Verzeichnisabgleich der Tabellen `hub_users`, `hub_vtcs`, `hub_memberships` und der Supabase-Auth-Benutzer über den Service-Role-Key.

Die lokalen kanonischen Tabellen bleiben `users`, `vtcs`, `memberships`, `roles` und `personnel_records`. Supabase-Datensätze werden dorthin gespiegelt. Der Service-Role-Key ist ausschließlich serverseitig zulässig. RLS darf für Browser-/Benutzerzugriffe nicht umgangen werden.

## 5. Bestehender Desktop- und Telemetriefluss

### 5.1 Komponenten

```text
ETS2/ATS
  → convoyhub_scs.dll (SCS Telemetry SDK)
  → JSON/UDP ausschließlich 127.0.0.1:35055
  → .NET-8-WPF-Client
  → HTTPS POST /api/v1/telemetry mit persönlichem Bearer-Schlüssel
  → D1/SQLite-Adapter
     ├─ telemetry + telemetry_details
     ├─ live_positions
     ├─ trips + trip_jobs + trip_reviews
     ├─ speed_incidents + point_ledger
     ├─ trip_vehicle_usage/Fuhrparkprüfung
     └─ payrolls + payroll_lines + payroll_reservations
```

### 5.2 Native Erfassung

Das C++-Plugin registriert sich für Frame-, Konfigurations- und Gameplay-Ereignisse. Es liest unter anderem:

- Weltposition X/Y/Z, Fahrtrichtung, Geschwindigkeit, Motordrehzahl und Gang
- Tank, Durchschnittsverbrauch, Reichweite und Kilometerstand
- Motor, Tempomat, Feststellbremse, Motorbremse, Retarder
- Blinker, Warnblinker, Licht und Rundumleuchte
- Bremsluftdruck, Wassertemperatur, Batteriespannung
- Lenkung, Gas und Bremse
- Navigation: Restdistanz, Restzeit und Tempolimit
- LKW-, Auflieger- und Frachtschaden
- LKW-/Auflieger-Konfigurations-ID, Marke, Modell und Kennzeichen
- Fracht, Masse, Start/Ziel, Firmen, geplante Entfernung und Spieleinnahmen
- Ereignisse `job.started`, `job.delivered`, `job.cancelled`, `game.exited`, außerdem Fahrzeug-/Trailerwechsel

Die Auftragskennung wird stabil aus Spiel, Start-/Zielfirmen, Start-/Zielstadt, Fracht-ID und Masse gebildet. Dadurch erkennt der Server denselben Auftrag nach einem Spielneustart wieder.

### 5.3 Clientverarbeitung

- Der Client erkennt ETS2/ATS-Prozesse und Spielinstallationen.
- Er installiert/repariert die native DLL in `bin/win_x64/plugins`.
- Er lauscht nur auf Loopback-Port `35055`; das Plugin öffnet keinen öffentlichen Netzwerkport.
- Die SCS-X/Z-Koordinaten werden je Spiel mit einem Lambert-Projektionsprofil in Breiten-/Längengrad umgerechnet. Rohkoordinaten und Projektionsprofil werden zusätzlich übertragen.
- Bei fehlender Verbindung werden Pakete lokal gepuffert und später synchronisiert.
- Aktiver Auftrag und `jobKey` werden in einer Wiederherstellungsdatei gespeichert.
- Bei `game.exited` wird eine Fahrt als unterbrochen markiert. Meldet das Spiel später denselben `jobKey`, wird sie fortgesetzt statt dupliziert.
- Die lokale Einstellung und der Schlüssel werden im Benutzerprofil gespeichert; der Schlüssel wird mit Windows-DPAPI geschützt. Klartextschlüssel gehören nicht in Logs oder normale Konfigurationsdateien.

### 5.4 Desktop-Anmeldung und persönlicher API-Schlüssel

OAuth-Desktopfluss:

1. Client sendet Provider an `POST /api/auth/desktop`.
2. Server erzeugt eine zehn Minuten gültige `desktop_auth_requests`-Anforderung und liefert `verificationUrl` und Polling-Token.
3. Browser öffnet `/api/auth/desktop/authorize`, setzt ein `desktop_auth`-Cookie und startet Google/Steam/Discord.
4. Nach erfolgreicher Browseranmeldung wird die Anforderung dem lokalen Benutzerkonto zugeordnet.
5. Client pollt `GET /api/auth/desktop?token=...` bis `approved`.
6. Der Server liefert Benutzer, aktive Mitgliedschaften, API-Basis und den kontogebundenen Schlüssel.

Passwortfluss:

1. Client meldet sich über `POST /api/auth/login` an und erhält die Websitzung im internen CookieContainer.
2. `GET /api/v1/client-access` liefert Mitgliedschaften und den persönlichen Schlüssel.
3. `GET /api/v1/client-bootstrap` stellt eine gespeicherte Anmeldung anhand des Bearer-Schlüssels wieder her.

Schlüsseleigenschaften:

- Formatpräfix `vth_user_`.
- Deterministisch über HMAC aus `BOT_INTERNAL_KEY`, ersatzweise serverseitigem Supabase-Service-Role-Key.
- In `api_keys` wird ausschließlich SHA-256-Hash, Präfix, Benutzerbindung, Scope und Widerrufsstatus gespeichert.
- Scope: `telemetry:write`.
- Der Schlüssel ist kontogebunden, nicht dauerhaft an eine einzelne VTC gebunden.
- Bei jeder Telemetrieübertragung muss der Benutzer aktive Mitgliedschaft in der vom Paket genannten VTC besitzen.
- `userId` und `vtcId` im JSON sind keine Autoritätsquelle; die Bearer-Zuordnung ist maßgeblich.

### 5.5 Telemetrie-Backend und Fahrtstatus

`POST /api/v1/telemetry`:

- prüft Bearer-Key, Scope, Benutzer, VTC-Mitgliedschaft, Spiel und Koordinaten;
- blockiert unrealistische Geschwindigkeit über 220 km/h zur manuellen Prüfung;
- ermittelt den stabilen `jobKey` und sucht `trip_jobs` nach VTC, Benutzer, Spiel und Job;
- prüft LKW/Auflieger gegen die Fuhrparkbindung;
- legt Fahrt und Job idempotent an;
- synchronisiert passende Dispositionsaufträge;
- verarbeitet Abbruch, Lieferung, Unterbrechung und Wiederaufnahme;
- speichert schlanke Historie in `telemetry`, vollständiges JSON 30 Tage in `telemetry_details` und den aktuellen Zustand in `live_positions`;
- berechnet Geschwindigkeitsvorfälle/Punkte;
- versendet bei Lieferung optional eine Discord-Einbettung;
- stößt bei Lieferung serverseitig die Abrechnungsübergabe an.

Relevante Zustände:

| Ereignis | Fahrt/Job | Folgewirkung |
|---|---|---|
| neuer Auftrag | `started`/`active` | Fahrt, Job und ggf. Disposition werden verbunden |
| Spiel/Client beendet | `interrupted` | bleibt wiederaufnehmbar |
| gleiches Jobprofil erneut erkannt | `started`/`active`, Response `resumed` | bestehende Fahrt wird fortgeführt |
| Auftrag im Spiel abgebrochen | `cancelled` | keine Lohnzahlung, Disposition `aborted` |
| Auftrag geliefert | zunächst `pending_driver` | serverseitige idempotente Abrechnungsübergabe |
| Fahrzeug gesperrt | `blocked_vehicle` | Fahrt nicht abrechenbar, anderes Fahrzeug nötig |
| Flottenzuordnung unklar | `pending_review` | manuelle Prüfung vor Abrechnung |

## 6. Abrechnung und Kommunikation mit dem Backend

Die Client-/Server-Kommunikation für die Abrechnung läuft über `POST /api/v1/payroll` mit `Authorization: Bearer <persönlicher Schlüssel>` und `{ "action": "confirmTrip", "tripId": "…" }`. Der Server akzeptiert nur eine Fahrt desselben Benutzers mit Status `pending_driver`, `confirmed` oder `approved`.

Der aktuelle Lieferpfad ist absichtlich doppelt abgesichert:

1. `/api/v1/telemetry` ruft bei `job.delivered` bereits serverseitig `submitDeliveredTrip()` auf.
2. Falls das vorübergehend fehlschlägt und die Response `pending_driver` bleibt, sendet der Client einmalig `confirmTrip` an `/api/v1/payroll`.

`submitDeliveredTrip()` und `createOrUpdateTripPayroll()` sind idempotent über Fahrt, Abrechnungszeile und eindeutige Indizes. Sie:

- prüfen den Fuhrparkstatus;
- wählen VTC-/Rollen-/Abteilungslohnmodell oder Plattformstandard;
- berechnen Kilometerlohn, Auftragsbonus, Zeitlohn, Monatsgrundlohn und Schadensabzug;
- erstellen/aktualisieren `payrolls` und `payroll_lines`;
- reservieren den Nettolohn über `payroll_reservations` auf einem VTC-Finanzkonto;
- buchen Auftragseinnahmen erst bei Freigabe/Buchungsaktion und verhindern Doppelbuchungen über Referenzen;
- aktivieren oder verwerfen zugehörige Punkte abhängig vom Fahrtentscheid.

Die endgültige Freigabe/Auszahlung ist VTC-gebunden und erfolgt über `/api/v1/finance` mit dem Recht `manage_payroll`, nicht über das globale Admin-Dashboard. Eine bereits bezahlte Abrechnung darf nicht durch eine nachträgliche Fahrtkorrektur still verändert werden; dafür werden Nachtrag/Storno verwendet.

## 7. Bestehende API-Routen

Alle Routen sind relativ zu `https://vtc-truck-hub.de`.

### 7.1 Authentifizierung und Konto

| Route | Methoden | Zweck/Schutz |
|---|---|---|
| `/api/auth/register` | POST | lokales Konto, Einwilligungen, Sitzung, persönlicher Schlüssel |
| `/api/auth/login` | POST | Supabase- oder lokaler Passwortlogin, 2FA, Sitzung |
| `/api/auth/me` | GET, PATCH, DELETE | Profil/Mitgliedschaften; Profil ändern; Abmelden/Sitzung löschen |
| `/api/auth/security` | GET, POST | Sicherheitsdaten, Passwort/2FA/Sitzungen |
| `/api/auth/supabase/session` | POST | Supabase-Token prüfen, Konto/Mitgliedschaften synchronisieren, lokale Sitzung |
| `/api/auth/google/start`, `/api/auth/google/callback` | GET | Google-/Supabase-OAuth-Start und vorhandener direkter Callback |
| `/api/auth/discord/start`, `/api/auth/discord/callback` | GET | Discord OAuth2 und Kontoverknüpfung |
| `/api/auth/steam/start`, `/api/auth/steam/callback` | GET | Steam OpenID und Steam-ID-Verknüpfung |
| `/api/auth/desktop` | POST, GET | Desktopanforderung erstellen und Status pollen |
| `/api/auth/desktop/authorize` | GET | Desktopanforderung im Browser an Provider übergeben |

### 7.2 Client, Telemetrie und Live-Map

| Route | Methoden | Zweck/Schutz |
|---|---|---|
| `/api/v1/client-access` | GET, POST | aktive Mitgliedschaften und persönlicher Schlüssel; Websitzung |
| `/api/v1/client-bootstrap` | GET | Clientkonto aus persönlichem Bearer-Schlüssel wiederherstellen |
| `/api/v1/client-download` | GET | administrativ gepflegter Client-Download |
| `/api/v1/telemetry` | POST, GET | Telemetrie schreiben bzw. letzte eigene/VTC-Daten lesen; `telemetry:write`-Bearer |
| `/api/v1/live` | GET | interne exakte oder öffentliche anonymisierte Near-Real-Time-Live-Positionen |
| `/api/v1/health` | GET | Erreichbarkeitsprüfung |

### 7.3 VTC-Fachmodule

| Route | Methoden | Aktionen/Zweck |
|---|---|---|
| `/api/v1/vtcs` | GET, POST | Verzeichnis/Profil; Kontakt, Meldung, Folgen, Bewertung, VTC anlegen |
| `/api/v1/dashboard` | GET | echte VTC-Kennzahlen |
| `/api/v1/management` | GET, POST | Rollen, Abteilungen, Fahrer, Personalaktionen, VTC-Profil, Discord-Verknüpfung |
| `/api/v1/applications` | GET, POST | Bewerbung, Formular, Notiz, Status, Aufnahme, Blacklist |
| `/api/v1/dispatch` | GET, POST | Auftrag anlegen, reservieren, annehmen, zurückgeben, zuweisen, stornieren |
| `/api/v1/trips` | GET, POST | Fahrten/CSV; manuell, Kommentar, Beleg, Korrektur, Prüfung, Massenprüfung |
| `/api/v1/fleet` | GET, POST | Fahrzeuge, Richtlinien, Spielbindung, Vorfälle, Wartung, Reservierung, Transfer, Verkauf |
| `/api/v1/payroll` | GET, POST | eigene Abrechnung; Fahrt bestätigen; Punkte abbauen |
| `/api/v1/finance` | GET, POST | VTC-Konten, Buchungen, Storno, Budget, Lohnmodelle, Korrektur und Freigabe |
| `/api/v1/statistics` | GET, POST | Fahrer-/VTC-Statistik, Ranglisten, Herausforderungen |
| `/api/v1/events` | GET, POST | Events, Anmeldung, Teilnehmer, Bericht, Wiederholung |
| `/api/v1/calendar` | GET, POST | Urlaub, Verfügbarkeit, Termine und Prüfung |
| `/api/v1/community` | GET, POST | News, Pinnwand, Kommentare, Reaktionen, Nachrichten, Partnerschaften, Aufgaben |
| `/api/v1/gallery` | GET, POST | Alben, Medienzuordnung, Moderation |
| `/api/v1/uploads` | GET, POST | kontrollierte Uploads und Abruf; VTC-/Zweckrechte |
| `/api/v1/notifications` | GET, POST | Einstellungen, gelesen, Push-Abo, Test |
| `/api/v1/resources` | GET, POST | Wiki/Schulung/Downloads, Bestätigung und Fortschritt |
| `/api/v1/integrations` | GET, POST | API-Schlüssel, Webhooks, Tests und Wiederholung |
| `/api/v1/truckersmp` | GET, POST | TruckersMP-Verknüpfung und Synchronisierung |
| `/api/tickets` | GET, POST | Supportticket erstellen, antworten, schließen |

### 7.4 Discord und Plattformadministration

| Route | Methoden | Zweck/Schutz |
|---|---|---|
| `/api/bot/config` | GET | Bot-Konfiguration über internen Bot-Schlüssel |
| `/api/bot/events` | POST | Bot-Ereignisse über internen Bot-Schlüssel |
| `/api/discord/interactions` | POST | signierte Discord-Interactions |
| `/api/admin` | GET, POST | Gründer-Dashboard und Plattformaktionen |
| `/api/admin/content` | GET, POST | Plattform-News und Wiki-Reiter |
| `/api/admin/discord` | GET, POST | Server, Regelwerk, Bilder, Bestätigungsrolle, Ankündigungen |
| `/api/admin/memberships` | GET, POST | Benutzer einer VTC und Rolle zuordnen |
| `/api/v1/public-content` | GET | veröffentlichte Startseiten-News und Wiki-Inhalte |

## 8. Datenmodell für Benutzer, Fahrer und Speditionen

### 8.1 Identität

```text
users (Konto)
├─ linked_accounts (Google, Discord, Steam, Supabase …)
├─ sessions
├─ account_security / account_tokens / security_events
├─ user_profile_details / user_profiles
├─ user_consents / notification_preferences
├─ api_keys (persönlicher Client/API-Zugang, nur Hash)
└─ memberships (n:m zu vtcs)
```

`users` ist das Login-/Identitätskonto. Ein Fahrer ist **kein zweites Benutzerkonto**, sondern eine aktive `membership` plus VTC-interner Datensatz in `personnel_records`. Dadurch kann ein Konto grundsätzlich mehrere Mitgliedschaften besitzen, während alle VTC-Daten mandantengebunden bleiben.

### 8.2 VTC und Fahrer

- `vtcs`: öffentliche Kerndaten, Slug, Tag, Spiele, Land, Sprache, Statuskennzahlen.
- `vtc_profiles`: Geschichte, Motto, Regeln, Sichtbarkeit, Farben, Logo/Header und zusätzliche Profildaten.
- `memberships`: Verbindung `user_id ↔ vtc_id`, Rolle, Fahrernummer, Status, Abteilung, Eintritt.
- `roles`: VTC-eigene Rangfolge, Farbe, Berechtigungsarray, Schutzstatus.
- `role_delegations`: zeitlich begrenzte Vertretungsrechte.
- `personnel_records`: Steam-/Discord-/TruckersMP-ID, Probezeit, Niederlassung, Hauptspiel, Präferenzen, Fahrerstatus und sensible Notizen.
- `personnel_actions`: nachvollziehbare Beförderung, Versetzung, Warnung, Austritt usw.
- `departments`: VTC-interne Abteilungen und Leitung.

Kernrelation für jeden geschützten Fachdatensatz:

```text
users.id
  → memberships.user_id + memberships.vtc_id + memberships.status='active'
  → roles.id / permissions
  → Fachdatensatz.vtc_id
```

### 8.3 Fahrt, Telemetrie, Live-Map und Fuhrpark

- `trips`: verdichtete, abrechenbare Fahrt.
- `trip_jobs`: stabile Spielauftragsidentität und Lebenszyklus.
- `trip_reviews`, `trip_comments`, `trip_edits`, `trip_evidence`: Prüfung und Nachvollziehbarkeit.
- `telemetry`: reduzierte Positions-/Statushistorie.
- `telemetry_details`: vollständiges JSON, automatische 30-Tage-Bereinigung.
- `live_positions`: genau eine aktuelle Position je Benutzer.
- `live_map_preferences`: öffentliche Sichtbarkeit, Verzögerung und interne Genauigkeit.
- `vehicles`, `vehicle_details`, `vehicle_game_bindings`: VTC-Fahrzeugakte und einmalige Verbindung zum erkannten Spielobjekt.
- `trip_vehicle_usage`: tatsächlich in einer Fahrt eingesetzter LKW/Auflieger und Compliance-Status.
- `fleet_policies`, `fleet_incidents`, `maintenance_records`, `vehicle_reservations`: Regeln, Sperren, Wartung und Reservierung.

### 8.4 Finanzen und Karriere

- `finance_accounts`, `finance_entries`, `budgets`: VTC-Wirtschaft.
- `payroll_models`, `payrolls`, `payroll_lines`, `payroll_reservations`: Lohnberechnung und reservierte Auszahlung.
- `wallets`, `wallet_transactions`: persönliches virtuelles Guthaben.
- `speed_incidents`, `point_ledger`, `economy_settings`: Punkte, Geschwindigkeit und Preise.
- `career_profiles`, `achievements`, `user_achievements`, `challenges`, `challenge_progress`: Karriere/Gamification.

Alle Geldwerte werden intern, soweit die jeweilige Tabelle es vorsieht, als Integer-Cents gespeichert. Die Plattformwirtschaft ist virtuell und darf nicht mit echten Zahlungsvorgängen vermischt werden.

## 9. Aktueller Live-Map-Stand

Die Live-Map ist bereits datenfähig, aber noch nicht WebSocket-basiert.

### 9.1 Schreibpfad

Jedes akzeptierte Telemetriepaket aktualisiert `live_positions` atomar per Upsert. Ein älteres Paket darf einen neueren Zustand nicht überschreiben (`excluded.updated_at >= live_positions.updated_at`). Zusätzlich bleibt die Route in `telemetry` erhalten. Positionen älter als einen Tag werden aus `live_positions` entfernt.

### 9.2 Lesepfad und Datenschutz

`GET /api/v1/live` unterscheidet:

- **Interne VTC-Ansicht:** aktive Mitglieder derselben VTC; exakte Positionen bis fünf Minuten, wenn der Fahrer `show_exact_to_vtc` erlaubt; 30-Minuten-Spur; empfohlenes Polling 3 Sekunden.
- **Öffentliche Ansicht:** nur Fahrer mit erlaubter öffentlicher Sichtbarkeit; Positionen aus `live_positions`, höchstens 15 Sekunden alt, mit `game`, `gameX` und `gameZ` für die Kartenkalibrierung; Namen bleiben anonymisiert und Fracht/Server werden nicht ausgegeben; empfohlenes Polling 3 Sekunden.

Die UI darf die Datenschutzentscheidung niemals allein treffen. Öffentliche Sichtbarkeit, Anonymisierung, maximale Aktualität und das Entfernen sensibler Felder bleiben serverseitig. Die Near-Real-Time-Freigabe der Roh-Spielkoordinaten ist eine bewusste Produktentscheidung für OBS-/Twitch-Einbettungen.

### 9.3 Architektur für Leaflet und WebSockets

Leaflet ist eine reine Darstellungsbibliothek. Es darf aus `/api/v1/live` beziehungsweise später einem autorisierten Stream lesen, aber keine eigene Telemetriedatenbank einführen.

Empfohlener konfliktfreier Ausbau:

```text
POST /api/v1/telemetry
  → Validierung + DB-Transaktion
  → live_positions aktualisieren
  → nach erfolgreichem Commit internes LivePositionUpdated-Ereignis
  → WebSocket/SSE-Broker
     ├─ interner VTC-Kanal: exakte, berechtigte Daten
     └─ öffentlicher Kanal: sichtbarkeitsgeprüft, near-real-time und anonymisiert

GET /api/v1/live
  → bleibt Snapshot/Fallback und initialer Kartenstand
```

Verbindliche Bedingungen für die spätere Implementierung:

1. Der bestehende Telemetrie-POST bleibt die einzige öffentliche Schreibschnittstelle.
2. Ein Stream-Ereignis wird erst nach erfolgreichem DB-Schreiben veröffentlicht.
3. WebSocket-Abonnements werden serverseitig anhand von Sitzung, VTC-Mitgliedschaft und Sichtbarkeit autorisiert.
4. Öffentliche Ereignisse dürfen nur für Fahrer mit erlaubter öffentlicher Sichtbarkeit ausgegeben werden. Namen, Fracht, Server und weitere sensible Felder bleiben entfernt; `game`, `gameX` und `gameZ` dürfen für die OBS-/Twitch-Kartendarstellung near-real-time übertragen werden.
5. Reconnect startet mit einem Snapshot aus `/api/v1/live` und setzt danach den Stream fort.
6. Ereignisse enthalten `userId`, `vtcId`, `recordedAt` und eine monotone/vergleichbare Versionszeit, damit Clients ältere Pakete verwerfen.
7. Positionshistorie bleibt in `telemetry`; der WebSocket ist kein dauerhaftes Archiv.
8. Rate-Limits, Backpressure, Heartbeats, maximale Abonnements und Entfernen veralteter Fahrer sind serverseitig zu definieren.
9. Kartenprojektion bleibt im Client nachvollziehbar versioniert (`projectionProfile`); Roh-X/Y/Z werden für spätere Korrekturen erhalten.
10. Für Plesk muss vor WebSockets geprüft werden, ob Proxy, Node-App und Keepalive korrekt konfiguriert sind. Bis dahin bleibt HTTP-Polling der funktionsfähige Fallback.

## 10. Bekannte Architektur-Risiken und technische Schulden

1. **Kein Docker-Setup vorhanden.** Vor Docker-Nutzung müssen Compose, Healthchecks, persistente Volumes, Migration-Job und ausschließlich `.env`-basierte DB-Konfiguration angelegt werden.
2. **Zwei Schemaquellen.** Drizzle und `ensureDatabase()` können auseinanderlaufen; die acht nur zur Laufzeit definierten Tabellen bestätigen dieses Risiko.
3. **SQLite-spezifisches SQL.** Ein direkter Wechsel auf Supabase/Postgres ist ohne Adapter/Migration nicht sicher.
4. **Supabase ist Spiegel und Auth-Quelle, nicht derzeit die alleinige Fach-Datenbank.** Neue Funktionen dürfen nicht willkürlich halb in Supabase und halb in SQLite schreiben.
5. **Google besitzt parallele Pfade.** Aktiver Supabase-OAuth-Start und direkter Callback müssen vereinheitlicht oder klar getrennt getestet werden.
6. **Live-Map nutzt Polling.** WebSockets/SSE sind noch nicht implementiert.
7. **`.env.example` ist unvollständig.** Es muss den vollständigen Variablenvertrag abbilden, ohne Geheimnisse zu enthalten.
8. **API-Versionierung ist nur im Pfad vorhanden.** Änderungen an Payloads benötigen rückwärtskompatible Felder oder eine neue Version, da installierte Desktop-Clients nicht gleichzeitig aktualisiert werden.
9. **Client-Updates hängen an GitHub `releases/latest`.** Ein Webrelease ohne Setup-EXE darf nicht als neue Desktopversion gelten; Client- und Webversion müssen getrennt veröffentlicht werden.

## 11. Prüfcheckliste für jede neue Funktion

Vor Umsetzung und Review ist zu beantworten:

- Welche vorhandene Tabelle, Route oder Servicefunktion wird erweitert?
- Ist die Änderung VTC-mandantensicher und serverseitig berechtigungsgeprüft?
- Bleiben bestehende Desktop-Clients und API-Payloads kompatibel?
- Gibt es eine versionierte Migration und ein Rollback-/Wiederherstellungskonzept?
- Werden alle DB-Verbindungswerte ausschließlich aus `.env`/`process.env` bezogen?
- Bleiben Service-Role-Key, DB-Passwort, Bot-Token und OAuth-Secrets ausschließlich serverseitig?
- Ist die Operation idempotent, falls Telemetrie oder Webhooks doppelt eintreffen?
- Werden Audit-Log, Fehlerzustand und manuelle Korrektur berücksichtigt?
- Werden Datenschutz, Aufbewahrung und automatische Löschung berücksichtigt?
- Funktionieren Cloudflare/D1, Plesk/Node und der geplante Docker-/Postgres-Adapter über dieselbe Fachschnittstelle?
- Wurde die Live-Map sowohl intern als auch öffentlich auf Verzögerung, Rundung und Sichtbarkeit geprüft?
- Wurde dokumentiert, ob Web-, API-, DB- oder Desktopversion angehoben werden muss?

## 12. Quelle der Wahrheit

Bei Widersprüchen gilt folgende Reihenfolge:

1. versionierte, geprüfte Datenbankmigration;
2. dieses `PROJECT_CONTEXT.md` nach bewusster Aktualisierung im selben Commit;
3. zentrale Servermodule in `lib/` und die dokumentierten API-Verträge;
4. UI-Implementierung und README-Texte;
5. generierte Buildartefakte niemals als Quelle.

Jede Architekturänderung muss dieses Dokument im selben Commit aktualisieren. Eine neue Live-Map-Implementierung beginnt daher mit der Konsolidierung der DB-Konfigurationsschicht und dem Eventvertrag, nicht mit einer zweiten parallelen Positionspipeline.
