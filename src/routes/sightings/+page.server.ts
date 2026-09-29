import type { PageServerLoad } from './$types';
import { getRecentSessions } from '$lib/server/db/sightings';
import type { D1Database } from '$lib/server/db/d1';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return { sessions: [] };

	const sessions = await getRecentSessions(db);
	return { sessions };
};
