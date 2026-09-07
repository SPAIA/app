-- Add Bugs, Grasshoppers, and Dragonflies as insect types; keep "Other" as
-- the last catch-all. "Other" previously used the cricket emoji, which now
-- belongs to Grasshoppers, so it's reassigned.
UPDATE insect_types SET icon = '❓', sort_order = 11 WHERE name = 'Other';

INSERT INTO insect_types (name, icon, sort_order) VALUES
  ('Bugs',         '🐛', 8),
  ('Grasshoppers', '🦗', 9),
  ('Dragonflies',  '🦟', 10);
