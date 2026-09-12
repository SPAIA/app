-- Extra reverse-geocode fields, alongside the existing locality/country, so
-- auto-created spaces (see spot creation) carry a fuller geographic picture.
ALTER TABLE spaces ADD COLUMN town TEXT;
ALTER TABLE spaces ADD COLUMN region TEXT;
ALTER TABLE spaces ADD COLUMN postcode TEXT;
