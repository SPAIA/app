-- One row per upload from a field device (camera trap / sensor) mounted at a
-- spot, covering the window [start_time, end_time]. trails is the device's
-- raw JSON array of tracked insect paths, stored as-is so the format can
-- evolve on the device side without a migration; insect_count is the
-- device's own tally for the window.
CREATE TABLE device_readings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT NOT NULL,
  spot_id       INTEGER NOT NULL REFERENCES spots(id),
  insect_count  INTEGER NOT NULL,
  trails        TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- A device retrying an upload it never got an answer for must not double
-- count: (device_id, start_time) identifies a window, and the endpoint
-- upserts on it.
CREATE UNIQUE INDEX idx_device_readings_window ON device_readings(device_id, start_time);
CREATE INDEX idx_device_readings_spot ON device_readings(spot_id, start_time);
