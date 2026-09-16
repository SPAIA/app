-- Visual Crossing joins Bright Sky as a weather source, used for non-German
-- locations (see $lib/server/weather). SQLite can't ALTER a CHECK
-- constraint in place, so rebuild the table with the widened constraint —
-- same rebuild-and-swap pattern as 0014_redeem_code_reuse.sql. Unlike that
-- table, sessions.weather_observation_id has a live FK into this one, and
-- D1 enforces it immediately per-statement (PRAGMA defer_foreign_keys had no
-- effect against it locally) — so DROP TABLE weather_observations fails
-- while any session still points into it. Work around that by parking the
-- FK values in a backup table, nulling the column for the rebuild, then
-- restoring it: ids are copied over unchanged below, so the restored values
-- are exactly the ones each session had before.
CREATE TABLE weather_observation_id_backup_0029 AS
SELECT id, weather_observation_id FROM sessions WHERE weather_observation_id IS NOT NULL;

UPDATE sessions SET weather_observation_id = NULL WHERE weather_observation_id IS NOT NULL;

CREATE TABLE weather_observations_new (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source                TEXT NOT NULL DEFAULT 'brightsky' CHECK (source IN ('brightsky', 'visualcrossing', 'manual')),
  lat                   REAL NOT NULL,
  lng                   REAL NOT NULL,
  observed_at           TEXT NOT NULL,
  fetched_at            TEXT DEFAULT (datetime('now')),
  station_id            TEXT,
  station_name          TEXT,
  station_distance_m    REAL,
  temperature_c         REAL,
  precipitation_mm      REAL,
  wind_speed_kmh        REAL,
  wind_gust_speed_kmh   REAL,
  cloud_cover_pct       INTEGER,
  sunshine_min          REAL,
  relative_humidity_pct INTEGER,
  pressure_msl_hpa      REAL,
  condition             TEXT,
  icon                  TEXT,
  bucket                TEXT NOT NULL CHECK (bucket IN ('sunny', 'partly', 'overcast', 'rainy')),
  windy                 INTEGER NOT NULL DEFAULT 0,
  raw_response          TEXT,
  created_at            TEXT DEFAULT (datetime('now'))
);

INSERT INTO weather_observations_new SELECT * FROM weather_observations;

DROP TABLE weather_observations;
ALTER TABLE weather_observations_new RENAME TO weather_observations;

CREATE INDEX idx_weather_observations_lookup ON weather_observations(lat, lng, observed_at);

UPDATE sessions
SET weather_observation_id = (
  SELECT weather_observation_id FROM weather_observation_id_backup_0029 WHERE weather_observation_id_backup_0029.id = sessions.id
)
WHERE sessions.id IN (SELECT id FROM weather_observation_id_backup_0029);

DROP TABLE weather_observation_id_backup_0029;
