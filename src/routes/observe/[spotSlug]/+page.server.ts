import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getInsectTypes, getSpotBySlug } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const spot = await getSpotBySlug(db, params.spotSlug);
	if (!spot) throw error(404, 'Spot not found');

	const insectTypes = await getInsectTypes(db);
	return { spot, insectTypes };
};
