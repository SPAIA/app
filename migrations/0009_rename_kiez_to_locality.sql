-- Kiez is no longer user-selected; localities come from reverse geocoding.
ALTER TABLE hubs RENAME COLUMN kiez TO locality;
ALTER TABLE sessions RENAME COLUMN kiez TO locality;
ALTER TABLE profiles RENAME COLUMN home_kiez TO home_locality;
ALTER TABLE hub_orders RENAME COLUMN kiez TO locality;
DROP INDEX IF EXISTS idx_hubs_kiez;
CREATE INDEX idx_hubs_locality ON hubs(locality);
