-- spot_insect_stats was already live in production (queries.ts has read/written it
-- for a while — getSpotSummary, incrementSpotInsectCount) but never got a migration
-- file, so a fresh D1 built from this migrations/ folder alone was missing it
-- entirely: every session save with a spot_id 500'd on incrementSpotInsectCount.
-- IF NOT EXISTS makes this a no-op against prod (which already has the table)
-- while still creating it on any new/local D1. Schema inferred from actual usage.
CREATE TABLE IF NOT EXISTS spot_insect_stats (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id        INTEGER NOT NULL REFERENCES spots(id),
  insect_type_id INTEGER REFERENCES insect_types(id),
  insect_name    TEXT NOT NULL,
  total_count    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(spot_id, insect_name)
);
CREATE INDEX IF NOT EXISTS idx_spot_insect_stats_spot ON spot_insect_stats(spot_id);

-- spots.total_minutes_observed has the same history (already live in prod, and
-- already patched onto this local D1 directly while debugging) but SQLite has no
-- "ADD COLUMN IF NOT EXISTS" — a genuinely fresh D1 built from this folder alone
-- will still need it added by hand once:
--   ALTER TABLE spots ADD COLUMN total_minutes_observed INTEGER DEFAULT 0;
