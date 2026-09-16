import type { WeatherObservation } from '$lib/types';
import { haversineKm } from '$lib/geo';
import type { D1Database } from './d1';

type WeatherObservationInsert = Omit<WeatherObservation, 'id' | 'fetched_at' | 'created_at' | 'windy'> & { windy: boolean };

/**
 * A cached reading within `maxAgeMinutes` and ~2km of (lat, lng), if one
 * exists — checked before ever calling Bright Sky, so nearby/recent sessions
 * reuse one row instead of each spending their own API call. The bounding
 * box keeps the SQL scan cheap (uses idx_weather_observations_lookup); the
 * exact haversine distance is then checked in JS on the handful of rows the
 * box returns.
 */
export async function findNearbyWeatherObservation(
	db: D1Database,
	params: { lat: number; lng: number; maxAgeMinutes: number; maxDistanceKm?: number }
): Promise<WeatherObservation | null> {
	const maxDistanceKm = params.maxDistanceKm ?? 2;
	// ~0.02° of latitude is ~2.2km; longitude degrees shrink toward the poles,
	// so widening by 1/cos(lat) keeps the box roughly circular at this latitude.
	const latPad = 0.02;
	const lngPad = latPad / Math.max(0.15, Math.cos((params.lat * Math.PI) / 180));

	const result = await db
		.prepare(`
			SELECT * FROM weather_observations
			WHERE lat BETWEEN ? AND ?
				AND lng BETWEEN ? AND ?
				AND fetched_at >= datetime('now', ?)
			ORDER BY fetched_at DESC
			LIMIT 20
		`)
		.bind(
			params.lat - latPad,
			params.lat + latPad,
			params.lng - lngPad,
			params.lng + lngPad,
			`-${params.maxAgeMinutes} minutes`
		)
		.all<WeatherObservation>();

	const candidates = result.results
		.map((row) => ({ row, distanceKm: haversineKm(params.lat, params.lng, row.lat, row.lng) }))
		.filter((c) => c.distanceKm <= maxDistanceKm)
		.sort((a, b) => a.distanceKm - b.distanceKm);

	return candidates[0]?.row ?? null;
}

/**
 * Same idea as findNearbyWeatherObservation, but for backfill: matches on the
 * exact historical hour instead of a freshness window, so many sessions at
 * the same spot on the same day reuse one row instead of one insert each.
 */
export async function findWeatherObservationForHour(
	db: D1Database,
	params: { lat: number; lng: number; observedAt: string; maxDistanceKm?: number }
): Promise<WeatherObservation | null> {
	const maxDistanceKm = params.maxDistanceKm ?? 2;
	const latPad = 0.02;
	const lngPad = latPad / Math.max(0.15, Math.cos((params.lat * Math.PI) / 180));

	const result = await db
		.prepare(`
			SELECT * FROM weather_observations
			WHERE lat BETWEEN ? AND ?
				AND lng BETWEEN ? AND ?
				AND observed_at = ?
			LIMIT 20
		`)
		.bind(params.lat - latPad, params.lat + latPad, params.lng - lngPad, params.lng + lngPad, params.observedAt)
		.all<WeatherObservation>();

	const candidates = result.results
		.map((row) => ({ row, distanceKm: haversineKm(params.lat, params.lng, row.lat, row.lng) }))
		.filter((c) => c.distanceKm <= maxDistanceKm)
		.sort((a, b) => a.distanceKm - b.distanceKm);

	return candidates[0]?.row ?? null;
}

/** Sessions still missing a real weather reading — the backfill worklist. */
export async function getSessionsMissingWeather(db: D1Database): Promise<{ id: string; lat: number; lng: number; started_at: string }[]> {
	const result = await db
		.prepare(`
			SELECT id, lat, lng, started_at FROM sessions
			WHERE weather_observation_id IS NULL AND lat IS NOT NULL AND lng IS NOT NULL AND started_at IS NOT NULL
		`)
		.all<{ id: string; lat: number; lng: number; started_at: string }>();
	return result.results;
}

/** Links a session to a weather observation and sets its display bucket — used by backfill. */
export async function setSessionWeatherObservation(
	db: D1Database,
	sessionId: string,
	weatherObservationId: number,
	bucket: 'sunny' | 'partly' | 'overcast' | 'rainy'
): Promise<void> {
	await db
		.prepare('UPDATE sessions SET weather_observation_id = ?, weather = ? WHERE id = ?')
		.bind(weatherObservationId, bucket, sessionId)
		.run();
}

export async function createWeatherObservation(db: D1Database, row: WeatherObservationInsert): Promise<number> {
	const result = (await db
		.prepare(`
			INSERT INTO weather_observations (
				source, lat, lng, observed_at, station_id, station_name, station_distance_m,
				temperature_c, precipitation_mm, wind_speed_kmh, wind_gust_speed_kmh, cloud_cover_pct,
				sunshine_min, relative_humidity_pct, pressure_msl_hpa, condition, icon, bucket, windy, raw_response
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			row.source,
			row.lat,
			row.lng,
			row.observed_at,
			row.station_id,
			row.station_name,
			row.station_distance_m,
			row.temperature_c,
			row.precipitation_mm,
			row.wind_speed_kmh,
			row.wind_gust_speed_kmh,
			row.cloud_cover_pct,
			row.sunshine_min,
			row.relative_humidity_pct,
			row.pressure_msl_hpa,
			row.condition,
			row.icon,
			row.bucket,
			row.windy ? 1 : 0,
			row.raw_response
		)
		.run()) as { success: boolean; meta: { last_row_id: number } };
	return result.meta.last_row_id;
}

export async function getWeatherObservationById(db: D1Database, id: number): Promise<WeatherObservation | null> {
	return db.prepare('SELECT * FROM weather_observations WHERE id = ?').bind(id).first<WeatherObservation>();
}

export async function getAllWeatherObservationsForExport(db: D1Database): Promise<Record<string, unknown>[]> {
	const result = await db
		.prepare('SELECT * FROM weather_observations ORDER BY observed_at ASC')
		.all<Record<string, unknown>>();
	return result.results;
}
