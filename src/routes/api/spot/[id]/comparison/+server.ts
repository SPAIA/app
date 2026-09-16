import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSpotSessionComparison } from '$lib/server/db/spots';

// How an in-progress session's tally stacks up against this spot's history —
// fetched from the "Your finds" screen, before the session is actually
// completed (see /api/sessions/complete, which returns the same shape once
// the session is saved for real).
export const GET: RequestHandler = async ({ params, url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const spotId = Number(params.id);
	if (!Number.isFinite(spotId)) throw error(400, 'Invalid spot id');

	const excludeSessionId = url.searchParams.get('exclude');
	if (!excludeSessionId) throw error(400, 'exclude is required');

	const comparison = await getSpotSessionComparison(db, spotId, excludeSessionId);
	return json({ comparison });
};
