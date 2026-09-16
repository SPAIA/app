import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getProfile,
	getSessionsMissingWeather,
	findWeatherObservationForHour,
	createWeatherObservation,
	setSessionWeatherObservation
} from '$lib/db/queries';
import { fetchHistoricalWeather, closestReading } from '$lib/server/brightSky';

/** Politeness delay between distinct Bright Sky day-fetches — no documented rate limit, but no reason to hammer a free public service. */
const DELAY_MS = 250;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ~1.1km at the equator — coarse enough that sessions at the same spot on the same day share one API call. */
function roundCoord(n: number): number {
	return Math.round(n * 100) / 100;
}

// One-off admin tool: fills in weather_observation_id for sessions saved
// before real weather (Bright Sky) existed. Groups sessions by (rounded
// location, day) so a spot with many historical sessions on the same day
// costs one Bright Sky call, not one per session — see
// findWeatherObservationForHour for the row-level reuse on top of that.
export const POST: RequestHandler = async ({ locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');
	if (!locals.user) throw error(401, 'Sign in required');

	const profile = await getProfile(db, locals.user.id);
	if (profile?.role !== 'admin') throw error(403, 'Admin only');

	const sessions = await getSessionsMissingWeather(db);

	const groups = new Map<string, { lat: number; lng: number; date: string; sessions: typeof sessions }>();
	for (const session of sessions) {
		const lat = roundCoord(session.lat);
		const lng = roundCoord(session.lng);
		const date = session.started_at.slice(0, 10);
		const key = `${lat},${lng},${date}`;
		const group = groups.get(key);
		if (group) {
			group.sessions.push(session);
		} else {
			groups.set(key, { lat, lng, date, sessions: [session] });
		}
	}

	let updated = 0;
	let skipped = 0;
	let apiCalls = 0;

	for (const group of groups.values()) {
		let dayReadings: Awaited<ReturnType<typeof fetchHistoricalWeather>>;
		try {
			dayReadings = await fetchHistoricalWeather({ lat: group.lat, lng: group.lng, date: group.date });
			apiCalls++;
			await sleep(DELAY_MS);
		} catch (err) {
			console.error('Bright Sky historical fetch failed', group, err);
			skipped += group.sessions.length;
			continue;
		}

		for (const session of group.sessions) {
			const reading = closestReading(dayReadings, session.started_at);
			if (!reading) {
				skipped++;
				continue;
			}

			const existing = await findWeatherObservationForHour(db, {
				lat: session.lat,
				lng: session.lng,
				observedAt: reading.observed_at
			});
			const observationId =
				existing?.id ?? (await createWeatherObservation(db, { ...reading, lat: session.lat, lng: session.lng }));

			await setSessionWeatherObservation(db, session.id, observationId, reading.bucket);
			updated++;
		}
	}

	return json({ updated, skipped, apiCalls, sessionsConsidered: sessions.length });
};
