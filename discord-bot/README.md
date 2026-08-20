# ConvoyHub Discord-Bot

Der eigenständige Gateway-Prozess übernimmt Willkommensnachrichten und automatische Rollen. Slash-Commands und Ticket-Modals werden signiert über die Plattform verarbeitet.

Benötigte Laufzeitwerte: `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `BOT_INTERNAL_KEY`, `CONVOYHUB_API` und optional `DISCORD_GUILD_ID` für schnelle Testregistrierung.

Der Bot benötigt die Intents `GUILDS` und `GUILD_MEMBERS` sowie auf dem Discord-Server die Rechte zum Senden von Nachrichten, Verwalten von Rollen und – für kanalbasierte Tickets – Verwalten von Kanälen.
