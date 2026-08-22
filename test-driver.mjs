import { readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const TEST_USER_ID = "local-live-map-test-driver";
const TEST_TRIP_ID = "local-live-map-test";
const TEST_NAME = "Testfahrer";
const TEST_GAME_X = 10397.3;
const TEST_GAME_Z = -9112.53;
const TEST_MAP_LATITUDE = -103.2841796875;
const TEST_MAP_LONGITUDE = 154.59375;
const DEVELOPMENT_DATABASE_DIRECTORY = resolve(
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);

function openDevelopmentDatabase() {
  let entries;
  try {
    entries = readdirSync(DEVELOPMENT_DATABASE_DIRECTORY, {
      withFileTypes: true,
    });
  } catch {
    throw new Error(
      "Keine lokale D1-Entwicklungsdatenbank gefunden. Starte zuerst einmal `npm run dev`.",
    );
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sqlite")) continue;

    const databasePath = resolve(DEVELOPMENT_DATABASE_DIRECTORY, entry.name);
    const candidate = new DatabaseSync(databasePath);
    const hasLiveMapSchema = candidate
      .prepare(
        `SELECT COUNT(*) AS tableCount
         FROM sqlite_schema
         WHERE type='table' AND name IN ('live_positions','telemetry')`,
      )
      .get().tableCount;

    if (hasLiveMapSchema === 2) {
      return { database: candidate, databasePath };
    }

    candidate.close();
  }

  throw new Error(
    "Die lokale D1-Datei wurde gefunden, enthält aber noch kein Live-Map-Schema.",
  );
}

const { database, databasePath } = openDevelopmentDatabase();
database.exec("PRAGMA foreign_keys=ON");
database.exec("PRAGMA busy_timeout=5000");

try {
  const activeVtc = database
    .prepare(
      `SELECT m.vtc_id AS vtcId
       FROM memberships m
       JOIN vtcs v ON v.id=m.vtc_id
       WHERE m.status='active'
       GROUP BY m.vtc_id
       ORDER BY COUNT(*) DESC,m.vtc_id
       LIMIT 1`,
    )
    .get();

  if (!activeVtc) {
    throw new Error(
      "Für den Testfahrer ist eine vorhandene VTC mit aktiver Mitgliedschaft erforderlich.",
    );
  }

  const now = new Date().toISOString();
  const telemetryRecordedAt = now;

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO users (id,display_name,locale,timezone,two_factor_enabled,created_at,updated_at)
         VALUES (?,?,'de','Europe/Berlin',0,?,?)
         ON CONFLICT(id) DO UPDATE SET
           display_name=excluded.display_name,
           updated_at=excluded.updated_at`,
      )
      .run(TEST_USER_ID, TEST_NAME, now, now);

    database
      .prepare(
        `INSERT INTO live_map_preferences
           (user_id,public_visible,public_delay_minutes,show_exact_to_vtc,updated_at)
         VALUES (?,1,10,1,?)
         ON CONFLICT(user_id) DO UPDATE SET
           public_visible=1,
           public_delay_minutes=10,
           show_exact_to_vtc=1,
           updated_at=excluded.updated_at`,
      )
      .run(TEST_USER_ID, now);

    database
      .prepare(
         `INSERT INTO live_positions
           (user_id,vtc_id,trip_id,game,latitude,longitude,game_x,game_y,game_z,
            coordinate_accuracy,projection_profile,heading,speed_kph,truck,active,updated_at)
         VALUES (?,?,?,'ets2',?,?,?,0,?,'raw-scs','local-test',90,85,'Test-Lkw',1,?)
         ON CONFLICT(user_id) DO UPDATE SET
           vtc_id=excluded.vtc_id,
           trip_id=excluded.trip_id,
           game=excluded.game,
           latitude=excluded.latitude,
           longitude=excluded.longitude,
           game_x=excluded.game_x,
           game_y=excluded.game_y,
           game_z=excluded.game_z,
           coordinate_accuracy=excluded.coordinate_accuracy,
           projection_profile=excluded.projection_profile,
           heading=excluded.heading,
           speed_kph=excluded.speed_kph,
           truck=excluded.truck,
           active=1,
           updated_at=excluded.updated_at`,
      )
      .run(
        TEST_USER_ID,
        activeVtc.vtcId,
        TEST_TRIP_ID,
        TEST_MAP_LATITUDE,
        TEST_MAP_LONGITUDE,
        TEST_GAME_X,
        TEST_GAME_Z,
        now,
      );

    const existingTelemetry = database
      .prepare(
        `SELECT id FROM telemetry
         WHERE user_id=? AND trip_id=?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(TEST_USER_ID, TEST_TRIP_ID);

    if (existingTelemetry) {
      database
        .prepare(
          `UPDATE telemetry SET
             vtc_id=?,game='ets2',latitude=?,longitude=?,heading=90,speed_kph=85,
             truck='Test-Lkw',recorded_at=?
           WHERE id=?`,
        )
        .run(
          activeVtc.vtcId,
          TEST_MAP_LATITUDE,
          TEST_MAP_LONGITUDE,
          telemetryRecordedAt,
          existingTelemetry.id,
        );
    } else {
      database
        .prepare(
          `INSERT INTO telemetry
             (trip_id,vtc_id,user_id,game,latitude,longitude,heading,speed_kph,truck,recorded_at)
           VALUES (?,?,?,'ets2',?,?,90,85,'Test-Lkw',?)`,
        )
        .run(
          TEST_TRIP_ID,
          activeVtc.vtcId,
          TEST_USER_ID,
          TEST_MAP_LATITUDE,
          TEST_MAP_LONGITUDE,
          telemetryRecordedAt,
        );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  console.log("Dummy-Fahrer erfolgreich eingefügt!");
  console.log(`Entwicklungs-DB: ${relative(process.cwd(), databasePath)}`);
  console.log(`VTC: ${activeVtc.vtcId}`);
  console.log(
    `Position: X=${TEST_GAME_X}, Z=${TEST_GAME_Z}, Heading=90°, Geschwindigkeit=85 km/h`,
  );
  console.log(
    `Öffentliche Kartenposition: [${TEST_MAP_LATITUDE}, ${TEST_MAP_LONGITUDE}]`,
  );
  console.log(
    "Der Fahrer ist intern und öffentlich near-real-time sichtbar; der öffentliche Name bleibt anonymisiert.",
  );
} finally {
  database.close();
}
