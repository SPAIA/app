import type { PageServerLoad } from './$types';
import { getRecentSightings } from '$lib/server/db/sightings';
import type { D1Database } from '$lib/server/db/d1';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return { sightings: [] };

	const sightings = await getRecentSightings(db);
	return { sightings };
};
