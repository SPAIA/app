import type { DeviceReading } from '$lib/types';
import type { D1Database } from './d1';

type DeviceReadingInsert = Omit<DeviceReading, 'id' | 'trails' | 'created_at'> & { trails: unknown[] };

/**
 * Upserts on (device_id, start_time), so a device re-sending a window it
 * never got a response for replaces the earlier row instead of adding a
 * second one.
 */
export async function upsertDeviceReading(db: D1Database, reading: DeviceReadingInsert): Promise<number> {
	const row = await db
		.prepare(`
			INSERT INTO device_readings (
				device_id, spot_id, insect_count, trails, start_time, end_time,
				temperature_c, relative_humidity_pct, pressure_hpa
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(device_id, start_time) DO UPDATE SET
				spot_id = excluded.spot_id,
				insect_count = excluded.insect_count,
				trails = excluded.trails,
				end_time = excluded.end_time,
				temperature_c = excluded.temperature_c,
				relative_humidity_pct = excluded.relative_humidity_pct,
				pressure_hpa = excluded.pressure_hpa
			RETURNING id
		`)
		.bind(
			reading.device_id,
			reading.spot_id,
			reading.insect_count,
			JSON.stringify(reading.trails),
			reading.start_time,
			reading.end_time,
			reading.temperature_c,
			reading.relative_humidity_pct,
			reading.pressure_hpa
		)
		.first<{ id: number }>();
	if (!row) throw new Error('device_readings upsert returned no row');
	return row.id;
}

export async function getDeviceReadingsBySpot(db: D1Database, spotId: number): Promise<DeviceReading[]> {
	const result = await db
		.prepare('SELECT * FROM device_readings WHERE spot_id = ? ORDER BY start_time DESC')
		.bind(spotId)
		.all<DeviceReading>();
	return result.results;
}
