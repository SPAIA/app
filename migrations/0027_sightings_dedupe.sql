-- The autosave/complete save path is at-least-once, not exactly-once: if a
-- request's response is lost after the server already processed it (a
-- network drop, a timeout), the client can't tell it succeeded and resends
-- the same tap batch on the next call — see $lib/sessionSave.ts. Until now
-- that resend blindly inserted a second row per tap, inflating `sightings`
-- (and, downstream, spot_insect_stats) beyond what sessions.total_count
-- (a pure client-side counter, unaffected by this) actually recorded.
--
-- Back up every row this migration is about to remove before removing it —
-- this runs once against real data, so it should be recoverable if anything
-- here turns out to be wrong. Safe to drop this table by hand later.
CREATE TABLE sightings_dedupe_backup_0027 AS
SELECT * FROM sightings
WHERE id NOT IN (
  SELECT MIN(id)
  FROM sightings
  GROUP BY session_id, insect_name, tapped_at
);

-- Now remove them: keep the earliest-inserted row for each
-- (session_id, insect_name, tapped_at) and drop the rest. tapped_at is the
-- moment the button was actually pressed, captured once client-side and
-- resent byte-identical on retry, so it's a safe natural key — two genuine
-- taps of the same species in the same session at the exact same
-- millisecond is not a real scenario.
DELETE FROM sightings
WHERE id IN (SELECT id FROM sightings_dedupe_backup_0027);

-- Recompute spot_insect_stats from the now-deduplicated sightings, joined to
-- their session's spot — it was double-incremented in lockstep with the
-- duplicate inserts above, via the same retries.
UPDATE spot_insect_stats
SET total_count = COALESCE(
  (
    SELECT COUNT(*)
    FROM sightings si
    JOIN sessions se ON se.id = si.session_id
    WHERE se.spot_id = spot_insect_stats.spot_id
      AND si.insect_name = spot_insect_stats.insect_name
  ),
  0
);

-- Enforce the natural key going forward — insertSighting now does
-- INSERT ... ON CONFLICT DO NOTHING against this index, so a resent tap is a
-- no-op instead of a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sightings_dedupe ON sightings(session_id, insect_name, tapped_at);
