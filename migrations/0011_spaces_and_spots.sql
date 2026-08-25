-- Hubs become spaces (e.g. a public park) which can contain many monitoring
-- spots (e.g. a patch of flowers within that park). Sessions now log against
-- a spot; space_id is kept on sessions too for cheap space-level rollups.

ALTER TABLE hubs RENAME TO spaces;

-- Prep for boundary drawing (see explore map): a GeoJSON Polygon/MultiPolygon
-- outlining the space, authored later via a MapLibre + Terra Draw UI.
ALTER TABLE spaces ADD COLUMN boundary_geojson TEXT;

CREATE TABLE spots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id    INTEGER NOT NULL REFERENCES spaces(id),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT DEFAULT '📍',
  lat         REAL,
  lng         REAL,
  active      INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(space_id, slug)
);
CREATE INDEX idx_spots_space ON spots(space_id);

ALTER TABLE sessions RENAME COLUMN hub_id TO space_id;
ALTER TABLE sessions RENAME COLUMN hub_name TO space_name;
ALTER TABLE sessions ADD COLUMN spot_id INTEGER REFERENCES spots(id);
ALTER TABLE sessions ADD COLUMN spot_name TEXT;

-- Backfill: every existing space gets a default "main" spot at its own
-- coordinates, so pre-migration sessions keep resolving to a real spot.
INSERT INTO spots (space_id, slug, name, icon, lat, lng)
SELECT id, 'main', name, icon, lat, lng FROM spaces;

UPDATE sessions
SET spot_id = (SELECT id FROM spots WHERE spots.space_id = sessions.space_id AND spots.slug = 'main'),
    spot_name = (SELECT name FROM spots WHERE spots.space_id = sessions.space_id AND spots.slug = 'main')
WHERE space_id IS NOT NULL;

ALTER TABLE hub_orders RENAME TO space_orders;
ALTER TABLE space_orders RENAME COLUMN hub_id TO space_id;
ALTER TABLE space_orders RENAME COLUMN hub_name TO space_name;

DROP INDEX IF EXISTS idx_hubs_locality;
CREATE INDEX idx_spaces_locality ON spaces(locality);
DROP INDEX IF EXISTS idx_sessions_hub;
CREATE INDEX idx_sessions_space ON sessions(space_id);
CREATE INDEX idx_sessions_spot ON sessions(spot_id);
