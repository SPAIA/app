-- Add Caterpillars & other larvae as an insect type, and keep "Other" as the
-- last catch-all option.
UPDATE insect_types SET sort_order = 12 WHERE name = 'Other';

INSERT INTO insect_types (name, icon, sort_order) VALUES
  ('Caterpillars', '🪱', 11);
