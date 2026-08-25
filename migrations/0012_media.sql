-- Generic media attachments (photos) that can hang off any of several entity
-- types. Polymorphic on purpose: a header image today might need to attach to
-- a hub pack or an insect_type tomorrow without another migration.
CREATE TABLE media (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('space', 'spot', 'profile', 'session', 'sighting')),
  entity_id     TEXT NOT NULL,
  media_type    TEXT NOT NULL DEFAULT 'gallery' CHECK (media_type IN ('header_image', 'gallery', 'thumbnail', 'avatar')),
  r2_key        TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  label         TEXT,
  notes         TEXT,
  attribution   TEXT,
  alt_text      TEXT,
  sort_order    INTEGER DEFAULT 0,
  uploaded_by   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Entities are looked up by (entity_type, entity_id) far more often than by id.
CREATE INDEX idx_media_entity ON media(entity_type, entity_id);
