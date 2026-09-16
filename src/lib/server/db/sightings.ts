import type { RecentSighting, InsectType, Sighting } from '$lib/types';
import type { D1Database } from './d1';

export async function getRecentSightings(db: D1Database, limit = 30): Promise<RecentSighting[]> {
	const result = await db
		.prepare(`
			SELECT
				si.insect_name,
				it.icon,
				si.count,
				si.tapped_at,
				se.locality,
				sc.name as space_name
			FROM sightings si
			JOIN sessions se ON si.session_id = se.id
			LEFT JOIN spaces sc ON se.space_id = sc.id
			LEFT JOIN insect_types it ON si.insect_type_id = it.id
			ORDER BY si.tapped_at DESC
			LIMIT ?
		`)
		.bind(limit)
		.all<RecentSighting>();
	return result.results;
}

export async function getInsectTypes(db: D1Database): Promise<InsectType[]> {
	const result = await db
		.prepare('SELECT * FROM insect_types WHERE active = 1 ORDER BY sort_order ASC')
		.all<InsectType>();
	return result.results;
}

export async function getSessionSightings(db: D1Database, sessionId: string): Promise<Sighting[]> {
	const result = await db
		.prepare('SELECT * FROM sightings WHERE session_id = ? ORDER BY tapped_at DESC')
		.bind(sessionId)
		.all<Sighting>();
	return result.results;
}

/**
 * One row per species, not one row per tap — `sightings` stores an individual
 * row (count always 1) for every button press, see insertSighting. Reads that
 * show a per-species breakdown (the share card) need this, not the raw rows.
 */
export async function getSessionSightingsAggregated(
	db: D1Database,
	sessionId: string
): Promise<{ name: string; count: number }[]> {
	const result = await db
		.prepare(`
			SELECT insect_name as name, SUM(count) as count
			FROM sightings
			WHERE session_id = ?
			GROUP BY insect_name
			ORDER BY count DESC
		`)
		.bind(sessionId)
		.all<{ name: string; count: number }>();
	return result.results;
}

export async function getUserCollection(
	db: D1Database,
	userId: string
): Promise<Array<{ space_id: number; space_name: string; space_icon: string; space_slug: string; insect_name: string; icon: string; count: number }>> {
	const result = await db
		.prepare(`
			SELECT
				sp.id as space_id,
				sp.name as space_name,
				sp.icon as space_icon,
				sp.slug as space_slug,
				si.insect_name,
				it.icon,
				SUM(si.count) as count
			FROM sightings si
			JOIN sessions se ON si.session_id = se.id
			JOIN spaces sp ON se.space_id = sp.id
			JOIN insect_types it ON si.insect_type_id = it.id
			WHERE se.user_id = ?
			GROUP BY sp.id, si.insect_name
			ORDER BY sp.id, it.sort_order
		`)
		.bind(userId)
		.all<{ space_id: number; space_name: string; space_icon: string; space_slug: string; insect_name: string; icon: string; count: number }>();
	return result.results;
}

export async function getAllSightingsForExport(db: D1Database): Promise<Record<string, unknown>[]> {
	const result = await db.prepare('SELECT * FROM sightings ORDER BY tapped_at ASC').all<Record<string, unknown>>();
	return result.results;
}

/** One row per sighting, joined through its session to the spot it was recorded at and the weather matched to that session — the shape data-viz comparisons across spots/weather/sightings actually want. */
export async function getJoinedObservationsForExport(db: D1Database): Promise<Record<string, unknown>[]> {
	const result = await db
		.prepare(
			`
			SELECT
				sightings.id AS sighting_id,
				sightings.insect_name,
				sightings.count,
				sightings.tapped_at,
				sessions.id AS session_id,
				sessions.started_at,
				sessions.completed_at,
				sessions.duration_min,
				sessions.spot_id,
				spots.name AS spot_name,
				spots.slug AS spot_slug,
				spots.lat AS spot_lat,
				spots.lng AS spot_lng,
				sessions.space_id,
				spaces.name AS space_name,
				sessions.locality,
				sessions.wind_observed,
				sessions.condition AS session_condition,
				weather_observations.observed_at AS weather_observed_at,
				weather_observations.temperature_c,
				weather_observations.precipitation_mm,
				weather_observations.wind_speed_kmh,
				weather_observations.wind_gust_speed_kmh,
				weather_observations.cloud_cover_pct,
				weather_observations.sunshine_min,
				weather_observations.relative_humidity_pct,
				weather_observations.pressure_msl_hpa,
				weather_observations.condition AS weather_condition,
				weather_observations.bucket AS weather_bucket,
				weather_observations.windy AS weather_windy
			FROM sightings
			JOIN sessions ON sessions.id = sightings.session_id
			LEFT JOIN spots ON spots.id = sessions.spot_id
			LEFT JOIN spaces ON spaces.id = sessions.space_id
			LEFT JOIN weather_observations ON weather_observations.id = sessions.weather_observation_id
			ORDER BY sessions.started_at ASC, sightings.tapped_at ASC
		`
		)
		.all<Record<string, unknown>>();
	return result.results;
}
