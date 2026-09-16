-- spot_name/space_name on sessions duplicated spots.name/spaces.name, so a
-- session kept showing the old name after the spot/space was renamed. Every
-- read now joins to spots/spaces for the live name instead.
ALTER TABLE sessions DROP COLUMN spot_name;
ALTER TABLE sessions DROP COLUMN space_name;
