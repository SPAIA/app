import type { PageServerLoad } from './$types';
import { getSessionById } from '$lib/server/db/sessions';
import { getSessionSightingsAggregated } from '$lib/server/db/sightings';
import { getMediaForEntity } from '$lib/server/db/media';
import type { D1Database } from '$lib/server/db/d1';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const session = await getSessionById(db, params.sessionId);
	if (!session) throw error(404, 'Session not found');

	// One row per species (count summed), not one row per tap — see
	// getSessionSightingsAggregated. The raw per-tap rows are what caused the
	// stats/pills on this page not to add up: every tap has its own row with
	// count always 1, so "types found" was actually showing total taps.
	const sightings = await getSessionSightingsAggregated(db, params.sessionId);
	const media = await getMediaForEntity(db, 'session', params.sessionId);
	const image = media[0] ?? null;

	return { session, sightings, image };
};
