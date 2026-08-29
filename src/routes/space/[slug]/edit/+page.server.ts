import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getSpaceBySlug, updateSpaceFields, getMediaForEntity } from '$lib/db/queries';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const user = locals.user;
	if (!user) throw redirect(303, `/auth/login?next=/space/${params.slug}/edit`);

	const space = await getSpaceBySlug(db, params.slug);
	if (!space) throw error(404, 'Space not found');
	if (space.owner_id !== user.id) throw error(403, 'Forbidden');

	const media = await getMediaForEntity(db, 'space', String(space.id));
	const cover = media.find((m) => m.media_type === 'header_image') ?? null;

	return { space, cover, stadiaApiKey: platform?.env?.STADIA_API_KEY ?? '' };
};

export const actions: Actions = {
	save: async ({ request, params, locals, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'Server error' });

		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorised' });

		const space = await getSpaceBySlug(db, params.slug);
		if (!space) return fail(404, { error: 'Space not found' });
		if (space.owner_id !== user.id) return fail(403, { error: 'Forbidden' });

		const form = await request.formData();
		const name = (form.get('name') as string | null)?.trim();
		if (!name) return fail(400, { error: 'Space name is required' });

		const locality = (form.get('locality') as string | null)?.trim() || null;
		const country = (form.get('country') as string | null)?.trim() || null;
		const latRaw = form.get('lat') as string | null;
		const lngRaw = form.get('lng') as string | null;
		const lat = latRaw ? Number(latRaw) : null;
		const lng = lngRaw ? Number(lngRaw) : null;

		const boundaryRaw = (form.get('boundary_geojson') as string | null)?.trim() || null;
		if (boundaryRaw) {
			try {
				const geom = JSON.parse(boundaryRaw);
				if (geom?.type !== 'Polygon' && geom?.type !== 'MultiPolygon') {
					return fail(400, { error: 'Invalid boundary' });
				}
			} catch {
				return fail(400, { error: 'Invalid boundary' });
			}
		}

		await updateSpaceFields(db, space.id, { name, locality, country, lat, lng, boundary_geojson: boundaryRaw });

		return { success: true };
	}
};
