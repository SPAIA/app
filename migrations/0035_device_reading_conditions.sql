-- Optional on-device sensor readings for the window, in the same units as
-- weather_observations. Pressure is the sensor's raw station pressure, not
-- reduced to sea level, hence pressure_hpa rather than pressure_msl_hpa.
-- NULL when the device has no such sensor.
ALTER TABLE device_readings ADD COLUMN temperature_c REAL;
ALTER TABLE device_readings ADD COLUMN relative_humidity_pct REAL;
ALTER TABLE device_readings ADD COLUMN pressure_hpa REAL;
