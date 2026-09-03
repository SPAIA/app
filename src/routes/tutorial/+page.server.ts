import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getInsectTypes } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const insectTypes = await getInsectTypes(db);
	return { insectTypes };
};
