-- Plants get their own taxonomic table, shared across every spot that has
-- one, instead of living as free-text strings on each spot. "type" is not a
-- real taxonomic rank — it's the bucket for a generic guess ("shrub",
-- "moss") that hasn't been pinned to a family/genus/species yet. gbif_id is
-- nullable and unique: most rows start out as an AI guess with no GBIF match,
-- and get one filled in later (by hand, or once Pl@ntNet is wired up) without
-- needing a new row.
CREATE TABLE plants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rank        TEXT NOT NULL CHECK (rank IN ('family', 'genus', 'species', 'type')),
  gbif_id     INTEGER UNIQUE,
  parent_id   INTEGER REFERENCES plants(id),
  created_at  TEXT DEFAULT (datetime('now'))
);

-- One row per name a plant is known by, so "Quercus robur" (la/scientific),
-- "oak" (en/common) and "Eiche" (de/common) can all point at the same plant
-- rather than forcing a single display name.
CREATE TABLE plant_names (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id      INTEGER NOT NULL REFERENCES plants(id),
  language      TEXT NOT NULL, -- ISO 639-1, e.g. 'en', 'de'; 'la' for scientific/Latin
  name_type     TEXT NOT NULL CHECK (name_type IN ('scientific', 'common')),
  name          TEXT NOT NULL,
  is_preferred  INTEGER DEFAULT 0,
  source        TEXT, -- 'deepseek_vision' | 'plantnet' | 'gbif' | 'manual'
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(plant_id, language, name_type, name)
);
CREATE INDEX idx_plant_names_lookup ON plant_names(language, name);

-- Habitat features read off a spot's photo. Groundcover is now one category
-- among several rather than its own field, so a boulder or a puddle gets
-- recorded as what it actually is instead of being crammed into "groundcover".
CREATE TABLE habitat_features (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id     INTEGER NOT NULL REFERENCES spots(id),
  media_id    TEXT NOT NULL REFERENCES media(id),
  category    TEXT NOT NULL CHECK (category IN (
                'groundcover', 'soil', 'rock_feature', 'woody_debris',
                'water', 'nesting_feature', 'vegetation_structure', 'other'
              )),
  label       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'deepseek_vision',
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_habitat_features_spot ON habitat_features(spot_id);

-- Links a spot's photo to the plants read from it — the join a many-to-many
-- spot<->plant relationship needs. Doubles as the cache Pl@ntNet will want:
-- check for a row on (media_id, source) before spending an API call
-- re-identifying a photo that's already been through it.
CREATE TABLE plant_observations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id       INTEGER NOT NULL REFERENCES spots(id),
  media_id      TEXT NOT NULL REFERENCES media(id),
  plant_id      INTEGER NOT NULL REFERENCES plants(id),
  confidence    REAL, -- DeepSeek doesn't give one; Pl@ntNet will
  source        TEXT NOT NULL CHECK (source IN ('deepseek_vision', 'plantnet', 'manual')),
  raw_response  TEXT, -- cached raw API payload, mainly for Pl@ntNet
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_plant_observations_spot ON plant_observations(spot_id);
CREATE INDEX idx_plant_observations_media ON plant_observations(media_id, source);
