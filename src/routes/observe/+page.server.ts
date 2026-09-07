import type { PageServerLoad } from './$types';
import { getSpotsForMap } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';

export const load: PageServerLoad = async ({ platform }) => {
	const stadiaApiKey = platform?.env?.STADIA_API_KEY ?? '';
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return { spots: [], stadiaApiKey };

	const spots = await getSpotsForMap(db);
	return { spots, stadiaApiKey };
};
