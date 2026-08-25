import type { PageServerLoad } from './$types';
import { getLeaderboard } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return { leaderboard: [] };

	const leaderboard = await getLeaderboard(db);
	return { leaderboard };
};
