import type { PageServerLoad } from './$types';
import { getSessionById, getSessionSightings, getMediaForEntity } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const session = await getSessionById(db, params.sessionId);
	if (!session) throw error(404, 'Session not found');

	const sightings = await getSessionSightings(db, params.sessionId);
	const media = await getMediaForEntity(db, 'session', params.sessionId);
	const image = media[0] ?? null;

	return { session, sightings, image };
};
