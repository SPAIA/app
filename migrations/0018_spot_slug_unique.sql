-- Spots become their own entry point: /observe/[spot-slug] addresses a spot
-- directly, with no space in the URL, so its slug must be unique across the
-- whole app rather than just within its space. A unique index (rather than
-- rebuilding the table for a new column constraint) sidesteps SQLite/D1
-- refusing to DROP TABLE spots while sessions/habitat_features/
-- plant_observations still hold foreign keys into it.

-- De-duplicate slugs that only used to be unique per-space (every space's
-- backfilled 'main' spot, most notably) by suffixing the space id.
UPDATE spots
SET slug = slug || '-' || space_id
WHERE slug IN (SELECT slug FROM spots GROUP BY slug HAVING COUNT(*) > 1);

CREATE UNIQUE INDEX idx_spots_slug ON spots(slug);
