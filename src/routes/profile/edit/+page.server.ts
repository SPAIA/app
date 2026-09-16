import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getProfile, updateProfileFields } from '$lib/server/db/profiles';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw redirect(303, '/auth/login');

	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login?next=/profile/edit');

	const profile = await getProfile(db, user.id);
	if (!profile) throw redirect(303, '/profile');

	return { profile };
};

export const actions: Actions = {
	save: async ({ request, locals, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'Server error' });

		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorised' });

		const form = await request.formData();
		const display_name = (form.get('display_name') as string | null)?.trim() || null;
		const bio = (form.get('bio') as string | null)?.trim() || null;
		const avatar_url = (form.get('avatar_url') as string | null)?.trim() || null;

		await updateProfileFields(db, user.id, { display_name, bio, avatar_url });

		return { success: true };
	}
};
