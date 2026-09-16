-- Part of the observation-persistence refactor: the client now syncs one
-- complete SessionSnapshot at a time (PUT /api/sessions/[id]) instead of
-- per-tap requests, and sightings are reconciled by delete-and-reinsert from
-- that snapshot rather than by incremental insert/delete. Each sighting now
-- carries the stable client-generated id it was created with (see
-- $lib/session/snapshot.ts), giving reconciliation a real identity instead
-- of relying on (session_id, insect_name, tapped_at) as a natural key.
ALTER TABLE sightings ADD COLUMN tap_id TEXT;

-- Superseded by the constraint below: two distinct taps of the same species
-- in the same session at the same millisecond both need to survive a
-- delete-and-reinsert sync now, so timestamp can no longer be part of the
-- identity key.
DROP INDEX IF EXISTS idx_sightings_dedupe;

-- The new identity key. NULLs (every row predating this migration) don't
-- conflict with each other or with anything else under SQLite's unique
-- index semantics, so this is safe to add without backfilling old rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sightings_tap_id ON sightings(session_id, tap_id);
