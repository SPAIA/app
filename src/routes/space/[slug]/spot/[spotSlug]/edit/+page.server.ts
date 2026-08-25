import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getSpaceBySlug, getSpotBySlug, updateSpotFields } from '$lib/db/queries';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const user = locals.user;
	if (!user) throw redirect(303, `/auth/login?next=/space/${params.slug}/spot/${params.spotSlug}/edit`);

	const space = await getSpaceBySlug(db, params.slug);
	if (!space) throw error(404, 'Space not found');

	const spot = await getSpotBySlug(db, params.spotSlug);
	if (!spot || spot.space_id !== space.id) throw error(404, 'Spot not found');

	// A spot can be managed by whoever bought/redeemed it, or by the space's
	// owner (spots created for free during a session have no owner of their own).
	if (space.owner_id !== user.id && spot.owner_id !== user.id) throw error(403, 'Forbidden');

	return { space, spot, stadiaApiKey: platform?.env?.STADIA_API_KEY ?? '' };
};

export const actions: Actions = {
	save: async ({ request, params, locals, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'Server error' });

		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorised' });

		const space = await getSpaceBySlug(db, params.slug);
		if (!space) return fail(404, { error: 'Space not found' });

		const spot = await getSpotBySlug(db, params.spotSlug);
		if (!spot || spot.space_id !== space.id) return fail(404, { error: 'Spot not found' });

		if (space.owner_id !== user.id && spot.owner_id !== user.id) return fail(403, { error: 'Forbidden' });

		const form = await request.formData();
		const name = (form.get('name') as string | null)?.trim();
		if (!name) return fail(400, { error: 'Spot name is required' });

		const icon = (form.get('icon') as string | null)?.trim() || '📍';
		const latRaw = form.get('lat') as string | null;
		const lngRaw = form.get('lng') as string | null;
		const lat = latRaw ? Number(latRaw) : null;
		const lng = lngRaw ? Number(lngRaw) : null;

		await updateSpotFields(db, spot.id, { name, icon, lat, lng });

		return { success: true };
	}
};
