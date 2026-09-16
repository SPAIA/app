import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProfile } from '$lib/db/queries';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw redirect(303, '/auth/login');

	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login?next=/admin');

	const profile = await getProfile(db, user.id);
	if (profile?.role !== 'admin') throw redirect(303, '/');

	return {};
};
