-- Wind is recorded as a paired value: weather_observations.wind_speed_kmh
-- (the DWD station reading, see 0024_weather_observations.sql) plus this
-- manual 4-step tap. Wind inside a food forest is not wind at the station —
-- the disagreement between the two is itself a usable signal, so neither
-- overwrites the other.
ALTER TABLE sessions ADD COLUMN wind_observed TEXT
  CHECK (wind_observed IN ('still', 'light_breeze', 'leaves_moving', 'branches_moving'));

-- Incidental wildlife spotted during a session that isn't a tappable insect
-- type — mice, snails, and so on. One row per creature (mirrors sightings /
-- habitat_features) rather than a JSON array, so it stays queryable.
CREATE TABLE session_creatures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  creature    TEXT NOT NULL CHECK (creature IN ('snail', 'mouse', 'worm', 'spider', 'bird', 'hedgehog', 'other')),
  label       TEXT, -- free text, only meaningful when creature = 'other'
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_session_creatures_session ON session_creatures(session_id);
