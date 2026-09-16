import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getInsectTypes } from '$lib/server/db/sightings';
import type { D1Database } from '$lib/server/db/d1';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const insectTypes = await getInsectTypes(db);
	return { insectTypes };
};
