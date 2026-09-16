import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findNearbyWeatherObservation, createWeatherObservation, getWeatherObservationById } from '$lib/db/queries';
import { fetchCurrentWeather } from '$lib/server/weather';

const CACHE_MAX_AGE_MINUTES = 60;

interface WeatherBody {
	lat: number;
	lng: number;
}

// Real weather for a session — Bright Sky (DWD open data) for German
// locations, Visual Crossing elsewhere, see $lib/server/weather. Reuses a
// nearby, recent reading instead of hitting the API for every session: most
// sessions at the same spot within an hour of each other share one row.
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const body = (await request.json()) as Partial<WeatherBody>;
	if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
		throw error(400, 'lat and lng are required');
	}
	const { lat, lng } = body;

	const cached = await findNearbyWeatherObservation(db, { lat, lng, maxAgeMinutes: CACHE_MAX_AGE_MINUTES });
	if (cached) return json({ observation: cached });

	try {
		const reading = await fetchCurrentWeather({ lat, lng, visualCrossingApiKey: platform?.env?.VISUAL_CROSSING_API_KEY });
		const id = await createWeatherObservation(db, reading);
		const observation = await getWeatherObservationById(db, id);
		return json({ observation });
	} catch (err) {
		console.error('Weather fetch failed', err);
		// Best-effort, same as the old DeepSeek weather guess: the session
		// still proceeds and the observer picks weather by hand.
		return json({ observation: null });
	}
};
