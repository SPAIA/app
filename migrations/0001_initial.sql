-- Insect types (DB-driven, extendable)
CREATE TABLE insect_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  icon        TEXT NOT NULL,
  rarity      TEXT NOT NULL DEFAULT 'common',
  xp_value    INTEGER NOT NULL DEFAULT 10,
  sort_order  INTEGER DEFAULT 0,
  active      INTEGER DEFAULT 1
);

-- Hubs (admin-seeded + user-created via hub pack)
CREATE TABLE hubs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kiez        TEXT NOT NULL,
  icon        TEXT DEFAULT '🌿',
  lat         REAL,
  lng         REAL,
  owner_id    TEXT,
  active      INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- User profiles (mirrors auth.users)
CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,
  display_name TEXT,
  home_kiez   TEXT,
  role        TEXT DEFAULT 'user',
  xp_total    INTEGER DEFAULT 0,
  level       INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  streak_last_date TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Observation sessions
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  hub_id      INTEGER REFERENCES hubs(id),
  hub_name    TEXT,
  kiez        TEXT,
  weather     TEXT,
  focal_area  TEXT,
  lat         REAL,
  lng         REAL,
  duration_min INTEGER NOT NULL,
  started_at  TEXT,
  completed_at TEXT,
  total_count INTEGER DEFAULT 0,
  xp_earned   INTEGER DEFAULT 0,
  shared      INTEGER DEFAULT 0
);

-- Individual sighting taps within a session
CREATE TABLE sightings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  insect_type_id INTEGER REFERENCES insect_types(id),
  insect_name TEXT NOT NULL,
  count       INTEGER DEFAULT 1,
  tapped_at   TEXT DEFAULT (datetime('now'))
);

-- Hub Pack orders
CREATE TABLE hub_orders (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  hub_name        TEXT,
  kiez            TEXT,
  stripe_status   TEXT DEFAULT 'pending',
  hub_id          INTEGER REFERENCES hubs(id),
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_hub ON sessions(hub_id);
CREATE INDEX idx_sightings_session ON sightings(session_id);
CREATE INDEX idx_hubs_kiez ON hubs(kiez);

-- Seed: insect types
INSERT INTO insect_types (name, icon, rarity, xp_value, sort_order) VALUES
  ('Bees',        '🐝', 'common', 10, 1),
  ('Butterflies', '🦋', 'common', 10, 2),
  ('Flies',       '🪰', 'common',  8, 3),
  ('Beetles',     '🪲', 'rare',   20, 4),
  ('Ants',        '🐜', 'common',  5, 5),
  ('Wasps',       '🐝', 'common', 10, 6),
  ('Spiders',     '🕷️', 'rare',   20, 7),
  ('Other',       '🦗', 'epic',   50, 8);

-- Seed: hubs
INSERT INTO hubs (slug, name, kiez, icon, lat, lng) VALUES
  ('tiergarten',      'Tiergarten',             'Mitte',   '🌳', 52.5145, 13.3501),
  ('humboldthain',    'Volkspark Humboldthain',  'Wedding', '🌿', 52.5495, 13.3842),
  ('naturkundemuseum','Naturkundemuseum',         'Mitte',   '🏛️', 52.5304, 13.3814),
  ('moawald',         'Moawald',                 'Moabit',  '🌿', 52.5279, 13.3400);
