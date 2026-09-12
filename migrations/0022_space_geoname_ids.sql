-- GeoNames ids for the locality/country/town/region strings on spaces — a
-- language-independent identifier for the actual place, since the display
-- strings are fetched in whatever language the geocoder was called with.
ALTER TABLE spaces ADD COLUMN country_geoname_id INTEGER;
ALTER TABLE spaces ADD COLUMN region_geoname_id INTEGER;
ALTER TABLE spaces ADD COLUMN town_geoname_id INTEGER;
ALTER TABLE spaces ADD COLUMN locality_geoname_id INTEGER;
