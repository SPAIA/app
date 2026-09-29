import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createWeatherObservation, getWeatherObservationById } from '$lib/server/db/weather';
import type { WeatherObservation } from '$lib/types';

const BUCKETS = ['sunny', 'partly', 'overcast', 'rainy'] as const;

interface ManualWeatherBody {
	/** The fetched reading being corrected, if there was one — its other readings (wind, humidity, ...) carry over. */
	basedOnId: number | null;
	lat: number;
	lng: number;
	temperature_c: number | null;
	bucket: WeatherObservation['bucket'];
	windy: boolean;
}

// The observer's correction of a fetched weather reading. Always a new
// 'manual' row, never an edit in place: fetched rows are shared by every
// nearby session within the hour (see POST /api/weather), so rewriting one
// would silently change other people's observations too.
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const body = (await request.json()) as Partial<ManualWeatherBody>;
	if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
		throw error(400, 'lat and lng are required');
	}
	if (!body.bucket || !BUCKETS.includes(body.bucket)) throw error(400, 'Invalid bucket');
	const temperature = typeof body.temperature_c === 'number' && Number.isFinite(body.temperature_c) ? body.temperature_c : null;

	const base = typeof body.basedOnId === 'number' ? await getWeatherObservationById(db, body.basedOnId) : null;

	const id = await createWeatherObservation(db, {
		source: 'manual',
		lat: base?.lat ?? body.lat,
		lng: base?.lng ?? body.lng,
		observed_at: base?.observed_at ?? new Date().toISOString(),
		station_id: base?.station_id ?? null,
		station_name: base?.station_name ?? null,
		station_distance_m: base?.station_distance_m ?? null,
		temperature_c: temperature,
		precipitation_mm: base?.precipitation_mm ?? null,
		wind_speed_kmh: base?.wind_speed_kmh ?? null,
		wind_gust_speed_kmh: base?.wind_gust_speed_kmh ?? null,
		cloud_cover_pct: base?.cloud_cover_pct ?? null,
		sunshine_min: base?.sunshine_min ?? null,
		relative_humidity_pct: base?.relative_humidity_pct ?? null,
		pressure_msl_hpa: base?.pressure_msl_hpa ?? null,
		condition: base?.condition ?? null,
		icon: base?.icon ?? null,
		bucket: body.bucket,
		windy: !!body.windy,
		raw_response: null
	});
	const observation = await getWeatherObservationById(db, id);
	return json({ observation });
};
