import type { PageServerLoad } from './$types';
import { getRecentSightings } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return { sightings: [] };

	const sightings = await getRecentSightings(db);
	return { sightings };
};
