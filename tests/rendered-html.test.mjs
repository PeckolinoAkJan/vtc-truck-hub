import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;
const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the VTC Truck Hub landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /VTC TRUCK/);
  assert.match(html, /Gemeinsam fahren\./);
  assert.match(html, /EURO TRUCK SIMULATOR 2/);
  assert.match(html, /AMERICAN TRUCK SIMULATOR/);
  assert.match(html, /Speditionen entdecken/i);
  assert.match(html, /News &amp; Ankündigungen/i);
  assert.match(html, /Wikipedia/i);
  assert.doesNotMatch(html, /href="\/dashboard"/i);
});

test("public navigation and knowledge routes render without login", async () => {
  const [companies, ranking, wiki, live] = await Promise.all([
    render("/speditionen"), render("/rangliste"), render("/wiki"), render("/live-map"),
  ]);
  for (const response of [companies, ranking, wiki, live]) assert.equal(response.status, 200);
  assert.match(await ranking.text(), /Rangliste/);
  const wikiHtml = await wiki.text();
  assert.match(wikiHtml, /Wikipedia/);
  assert.match(wikiHtml, /Startseite/);
});

test("admin route is present and founder-gated", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Gründerrechte werden geprüft/);

  const [adminPage, adminApi] = await Promise.all([
    readFile(new URL("../app/gruender/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(adminPage, /Audit & Sicherheit/);
  assert.match(adminPage, /Wirtschaft & Punkte/);
  assert.match(adminApi, /requireFounder/);
  assert.match(adminApi, /approvePayroll/);
  assert.match(adminApi, /clientVersion/);
});

test.skip("legacy starter preview is no longer part of the production app", async () => {
  const [preview, css, page, layout, packageJson, files] = await Promise.all([
    readFile(new URL("SkeletonPreview.tsx", previewRoot), "utf8"),
    readFile(new URL("preview.css", previewRoot), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readdir(previewRoot),
  ]);

  assert.deepEqual(files.sort(), ["SkeletonPreview.tsx", "preview.css"]);
  assert.match(preview, /from "react-loading-skeleton"/);
  assert.match(preview, /baseColor="#eceae7"/);
  assert.match(preview, /highlightColor="#f9f8f6"/);
  assert.match(preview, /duration=\{2\.8\}/);
  assert.match(preview, /sites-skeleton-search-placeholder/);
  assert.match(packageJson, /"react-loading-skeleton": "3\.5\.0"/);

  const shellIndex = preview.indexOf('className="sites-skeleton-shell"');
  const statusIndex = preview.indexOf('className="sites-skeleton-status"');
  assert.ok(shellIndex >= 0 && statusIndex > shellIndex);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /inset:\s*0/);
  assert.match(css, /opacity:\s*0\.52/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /#020617|canvas|pets|progress/i);
  assert.doesNotMatch(
    preview,
    /loading-spinner|status-mark|status-progress|canvas|cookie|random/i,
  );

  assert.match(page, /export const metadata:\s*Metadata/);
  assert.match(page, /"codex-preview": "development"/);
  assert.match(page, /<SkeletonPreview \/>/);
  assert.match(layout, /title:\s*"Starter Project"/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|themeColor|\bViewport\b/);
  assert.doesNotMatch(css, /(^|\s)(html|body)\s*\{/m);

  await assert.rejects(
    access(new URL("public/_sites-preview", templateRoot)),
  );
});

test("release-critical website and client assets exist", async () => {
  await Promise.all([
    access(new URL("../app/fahrtenbuch/TripsExperience.tsx", import.meta.url)),
    access(new URL("../app/fahrtenbuch/tripbook.css", import.meta.url)),
    access(new URL("../app/brand-refresh.css", import.meta.url)),
    access(new URL("../desktop-client/ConvoyHub.Client/Assets/vtc-truck-hub-login.png", import.meta.url)),
    access(new URL("../desktop-client/ConvoyHub.Client/plugins/convoyhub_scs.dll", import.meta.url)),
  ]);
});

test("multi-VTC Discord workflow is wired end to end", async () => {
  const [bot, telemetry, management, admin, schema] = await Promise.all([
    readFile(new URL("../discord-bot/src/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/telemetry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/verwaltung/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/gruender/discord-bot/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(bot, /rules_accept:/);
  assert.match(bot, /members\/\$\{userId\}\/roles/);
  assert.match(telemetry, /notifyDiscordDelivery/);
  assert.match(telemetry, /discord_delivery_log/);
  assert.match(management, /saveDiscordIntegration/);
  assert.match(management, /Bot zu Discord einladen/);
  assert.match(admin, /Willkommensbild/);
  assert.match(admin, /Regelwerk veröffentlichen/);
  assert.match(schema, /discordGuildBranding/);
});

test("desktop login is gated and telemetry credentials are account-bound", async () => {
  const [client, clientUi, desktopAuth, bootstrap, access, telemetry, credentials] = await Promise.all([
    readFile(new URL("../desktop-client/ConvoyHub.Client/MainWindow.xaml.cs", import.meta.url), "utf8"),
    readFile(new URL("../desktop-client/ConvoyHub.Client/MainWindow.xaml", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/desktop/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/client-bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/client-access/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/telemetry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/client-access.ts", import.meta.url), "utf8"),
  ]);
  assert.match(clientUi, /x:Name="LoginGate"/);
  assert.match(clientUi, /GateLogin_Click/);
  assert.match(client, /RestoreAccountAsync/);
  assert.match(client, /MonitorAccountBinding/);
  assert.match(client, /NormalizeApiUrl/);
  assert.match(client, /return "https:\/\/vtc-truck-hub\.de"/);
  assert.doesNotMatch(client, /settings\.ApiUrl\.TrimEnd/);
  assert.match(client, /ProtectedData\.Protect/);
  assert.match(desktopAuth, /verificationUrl/);
  assert.match(desktopAuth, /provider=\$\{provider\}&token=\$\{encodeURIComponent\(token\)\}/);
  assert.match(desktopAuth, /clientKey/);
  assert.match(bootstrap, /Authorization/i);
  assert.match(access, /issuePersonalClientKey\(user\.id\)/);
  assert.match(credentials, /vtc-truck-hub:telemetry:\$\{userId\}/);
  assert.match(telemetry, /Keine aktive Mitgliedschaft für diese Spedition/);
});

test("live map uses projected SCS telemetry without invented drivers", async () => {
  const [mapPage, liveMapClient, liveApi, telemetryApi, projector, client, platform, payroll, testDriver] = await Promise.all([
    readFile(new URL("../app/live-map/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LiveMapClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/live/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/telemetry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop-client/ConvoyHub.Client/ScsCoordinateProjector.cs", import.meta.url), "utf8"),
    readFile(new URL("../desktop-client/ConvoyHub.Client/MainWindow.xaml.cs", import.meta.url), "utf8"),
    readFile(new URL("../lib/platform.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/payroll/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../test-driver.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(projector, /Lambert conformal/);
  assert.match(projector, /ets2-base-lambert-v1/);
  assert.match(projector, /ats-base-lambert-v1/);
  assert.match(client, /ScsCoordinateProjector\.ProjectWithFallback/);
  assert.match(client, /coordinateAccuracy=mapPosition\.Accuracy/);
  assert.match(client, /projectionProfile=mapPosition\.Profile/);
  assert.match(client, /offline-queue\.jsonl/);
  assert.match(client, /Gespeicherter Auftrag erkannt und fortgesetzt/);
  assert.match(client, /ConfirmInvoiceAsync/);
  assert.match(client, /request\.Headers\.Authorization=new AuthenticationHeaderValue\("Bearer",settings\.ApiKey\)/);
  assert.match(telemetryApi, /ON CONFLICT\(user_id\) DO UPDATE/);
  assert.match(telemetryApi, /excluded\.updated_at>=live_positions\.updated_at/);
  assert.match(telemetryApi, /const telemetryInsert=await db/);
  assert.doesNotMatch(telemetryApi, /supplied === configured/);
  assert.match(platform, /CREATE TABLE IF NOT EXISTS live_positions/);
  assert.match(liveApi, /internal-exact/);
  assert.match(liveApi, /public-near-real-time-anonymized/);
  assert.match(liveApi, /public_visible/);
  assert.match(liveApi, /FROM live_positions lp/);
  assert.match(liveApi, /COALESCE\(driver_pref\.show_exact_to_vtc,1\)=1/);
  assert.match(liveApi, /lp\.game_x AS gameX/);
  assert.match(liveApi, /lp\.game_z AS gameZ/);
  assert.match(liveApi, /datetime\(lp\.updated_at\)>datetime\('now','-15 seconds'\)/);
  assert.doesNotMatch(liveApi, /ROW_NUMBER\(\) OVER|-10 minutes|-25 minutes/);
  assert.match(liveApi, /"Cache-Control": "private, no-store, max-age=0"/);
  assert.doesNotMatch(liveApi, /EventEmitter|text\/event-stream|liveMapEmitter/);
  assert.match(mapPage, /^"use client";/);
  assert.doesNotMatch(mapPage, /^import LiveMapClient/m);
  assert.match(mapPage, /import\("\.\.\/\.\.\/components\/LiveMapClient"\)/);
  assert.match(mapPage, /useState\(false\)/);
  assert.match(mapPage, /setIsMounted\(true\)/);
  assert.doesNotMatch(mapPage, /next\/dynamic|ssr:\s*false/);
  assert.match(liveMapClient, /import "leaflet\/dist\/leaflet\.css"/);
  assert.match(liveMapClient, /L\.CRS\.Simple/);
  assert.match(liveMapClient, /MapContainer/);
  assert.match(liveMapClient, /height: "100vh"/);
  assert.match(liveMapClient, /minHeight: "500px"/);
  assert.match(liveMapClient, /setPositions\(\[\]\)/);
  assert.match(testDriver, /node:sqlite/);
  assert.match(testDriver, /\.wrangler\/state\/v3\/d1\/miniflare-D1DatabaseObject/);
  assert.match(testDriver, /ON CONFLICT\(user_id\) DO UPDATE/);
  assert.match(testDriver, /const telemetryRecordedAt = now/);
  assert.match(liveMapClient, /TileLayer/);
  assert.match(liveMapClient, /Marker/);
  assert.match(liveMapClient, /Popup/);
  assert.match(liveMapClient, /POLLING_INTERVAL_MS = 3000/);
  assert.match(liveMapClient, /useState<"ets2" \| "ats">\("ets2"\)/);
  assert.match(liveMapClient, /setActiveGame/);
  assert.match(liveMapClient, /key=\{activeGame\}/);
  assert.match(liveMapClient, /https:\/\/livemap\.vtc-truck-hub\.de\/\$\{activeGame\}\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(liveMapClient, /telemetryGame === activeGame/);
  assert.match(liveMapClient, /scsToLeaflet/);
  assert.match(liveMapClient, /gameX/);
  assert.match(liveMapClient, /gameZ/);
  assert.match(liveMapClient, /truck-marker-container/);
  assert.match(liveMapClient, /truck-svg--ets2/);
  assert.match(liveMapClient, /truck-svg--ats/);
  assert.match(liveMapClient, /truck-label/);
  assert.match(liveMapClient, /escapeHtml/);
  assert.match(liveMapClient, /truckIcon\(position\.game, position\.heading, name\)/);
  assert.match(liveMapClient, /KEINE AKTIVEN FAHRER/);
  assert.doesNotMatch(liveMapClient, /EventSource|simulation|simulated/i);
  assert.match(payroll, /confirmTrip/);
  assert.match(payroll, /personalClientKeyName/);
  assert.match(payroll, /authenticatedUser\(request\)/);
});

test("delivered trips reach payroll automatically and paid months use supplements", async () => {
  const [payrollLogic, telemetry, trips, finance, client, payrollPage] = await Promise.all([
    readFile(new URL("../lib/payroll.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/telemetry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/trips/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/finance/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop-client/ConvoyHub.Client/MainWindow.xaml.cs", import.meta.url), "utf8"),
    readFile(new URL("../app/abrechnung/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(payrollLogic, /export async function submitDeliveredTrip/);
  assert.match(payrollLogic, /Nachtrag/);
  assert.match(payrollLogic, /!isSupplemental/);
  assert.match(payrollLogic, /reconcilePendingDriverTrips/);
  assert.match(telemetry, /await submitDeliveredTrip\(tripId\)/);
  assert.match(trips, /trip!\.status === "pending_driver"/);
  assert.match(finance, /await reconcilePendingDriverTrips\(vtcId\)/);
  assert.match(client, /await ConfirmInvoiceAsync\(\)/);
  assert.doesNotMatch(client, /Möchtest du die Abrechnung jetzt bestätigen/);
  assert.match(client, /Automatisch übermittelt/);
  assert.match(payrollPage, /Übermittlung erneut versuchen/);
});

test("fleet bindings block maintenance assets before trip approval and payroll", async () => {
  const [schema, compliance, fleetApi, telemetry, payroll, client, clientUi, plugin, fleetPage] = await Promise.all([
    readFile(new URL("../lib/platform.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/fleet-compliance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/fleet/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/telemetry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/payroll.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop-client/ConvoyHub.Client/MainWindow.xaml.cs", import.meta.url), "utf8"),
    readFile(new URL("../desktop-client/ConvoyHub.Client/MainWindow.xaml", import.meta.url), "utf8"),
    readFile(new URL("../desktop-client/ConvoyHub.ScsPlugin/convoyhub_plugin.cpp", import.meta.url), "utf8"),
    readFile(new URL("../app/fuhrpark/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS vehicle_game_bindings/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS trip_vehicle_usage/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS fleet_incidents/);
  assert.match(compliance, /\["maintenance", "defective", "out_of_service", "sold"\]/);
  assert.match(compliance, /updateFleetVehicleState/);
  assert.match(compliance, /refreshBindingUsage/);
  assert.match(fleetApi, /startMaintenance/);
  assert.match(fleetApi, /fleet_maintenance/);
  assert.match(fleetApi, /importBinding/);
  assert.match(telemetry, /fleet_blocked/);
  assert.match(telemetry, /updateFleetVehicleState/);
  assert.match(payroll, /tripFleetCompliance/);
  assert.match(client, /SAPI\.SpVoice/);
  assert.match(client, /Bitte nutzen Sie ein anderes Fahrzeug oder einen anderen Auflieger/);
  assert.match(clientUi, /x:Name="FleetWarningPanel"/);
  assert.match(plugin, /SCS_TELEMETRY_CONFIG_truck/);
  assert.match(plugin, /SCS_TELEMETRY_CONFIG_trailer/);
  assert.match(fleetPage, /Spielkopplung/);
  assert.match(fleetPage, /Als neuen/);
  assert.match(fleetPage, /Warnton und Sprachansage im Client aktivieren/);
});
