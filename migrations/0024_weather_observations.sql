-- Real weather, sourced from Bright Sky (DWD open data) instead of guessed by
-- DeepSeek Vision off the spot photo. One row per API reading, keyed by the
-- location/time it was fetched for — sessions link to a row instead of
-- storing a bare string, so the full reading (wind, cloud cover, station
-- provenance, the raw payload) survives even though the UI only shows the
-- 4-bucket label and a windy flag today. Deliberately mirrors the
-- plant_observations pattern: dedicated table, source column, raw_response
-- cache (see 0016_plants_and_habitat_features.sql).
CREATE TABLE weather_observations (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source                TEXT NOT NULL DEFAULT 'brightsky' CHECK (source IN ('brightsky', 'manual')),
  lat                   REAL NOT NULL,
  lng                   REAL NOT NULL,
  observed_at           TEXT NOT NULL, -- the DWD record's own timestamp
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
  condition             TEXT, -- brightsky's own enum: dry/fog/rain/sleet/snow/hail/thunderstorm
  icon                  TEXT, -- brightsky's icon enum
  bucket                TEXT NOT NULL CHECK (bucket IN ('sunny', 'partly', 'overcast', 'rainy')),
  windy                 INTEGER NOT NULL DEFAULT 0,
  raw_response          TEXT, -- full API JSON, future-proofing
  created_at            TEXT DEFAULT (datetime('now'))
);
-- Bounding-box lookups for "is there already a nearby, recent reading?" — see
-- findNearbyWeatherObservation. lat/lng first so the box scan stays cheap.
CREATE INDEX idx_weather_observations_lookup ON weather_observations(lat, lng, observed_at);

ALTER TABLE sessions ADD COLUMN weather_observation_id INTEGER REFERENCES weather_observations(id);
-- Free-text: "mice, snails, tracks" — anything worth remembering that isn't a tappable insect.
ALTER TABLE sessions ADD COLUMN notes TEXT;
CREATE INDEX idx_sessions_weather_observation ON sessions(weather_observation_id);
