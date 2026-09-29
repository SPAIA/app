import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getMediaForEntity } from '$lib/server/db/media';
import { createSpace, getSpaceById, getSpaceBySlug, getSpacesByOwner } from '$lib/server/db/spaces';
import { deactivateSpot, getSpotBySlug, moveSpotToSpace, updateSpotFields } from '$lib/server/db/spots';
import { uniqueSlug } from '$lib/slug';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const user = locals.user;
	if (!user) throw redirect(303, `/auth/login?next=/spot/${params.spotSlug}/edit`);

	const spot = await getSpotBySlug(db, params.spotSlug);
	if (!spot) throw error(404, 'Spot not found');

	const space = await getSpaceById(db, spot.space_id);
	if (!space) throw error(404, 'Space not found');

	// A spot can be managed by whoever bought/redeemed it, or by the space's
	// owner (spots created for free during a session have no owner of their own).
	if (space.owner_id !== user.id && spot.owner_id !== user.id) throw error(403, 'Forbidden');

	const media = await getMediaForEntity(db, 'spot', String(spot.id));
	const cover = media.find((m) => m.media_type === 'header_image') ?? null;

	// Spaces the spot can be moved into: only ones this user owns.
	const moveTargets = (await getSpacesByOwner(db, user.id)).filter((s) => s.id !== space.id);

	return { space, spot, cover, moveTargets, stadiaApiKey: platform?.env?.STADIA_API_KEY ?? '' };
};

export const actions: Actions = {
	save: async ({ request, params, locals, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'Server error' });

		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorised' });

		const spot = await getSpotBySlug(db, params.spotSlug);
		if (!spot) return fail(404, { error: 'Spot not found' });

		const space = await getSpaceById(db, spot.space_id);
		if (!space) return fail(404, { error: 'Space not found' });

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
	},

	// Moves the spot into another space the user owns, or into a brand-new one
	// named here. New spaces skip the paid order: the spot itself was already
	// bought or redeemed.
	move: async ({ request, params, locals, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'Server error' });

		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorised' });

		const spot = await getSpotBySlug(db, params.spotSlug);
		if (!spot) return fail(404, { error: 'Spot not found' });

		const space = await getSpaceById(db, spot.space_id);
		if (!space) return fail(404, { error: 'Space not found' });

		if (space.owner_id !== user.id && spot.owner_id !== user.id) return fail(403, { error: 'Forbidden' });

		const form = await request.formData();
		const newSpaceName = (form.get('newSpaceName') as string | null)?.trim();
		const targetSlug = (form.get('targetSpace') as string | null)?.trim();

		let targetId: number;

		if (newSpaceName) {
			const slug = await uniqueSlug(newSpaceName, (candidate) =>
				getSpaceBySlug(db, candidate).then((s) => s !== null)
			);
			targetId = await createSpace(db, {
				slug,
				name: newSpaceName,
				locality: '',
				country: null,
				icon: '🌿',
				lat: spot.lat,
				lng: spot.lng,
				owner_id: user.id
			});
		} else if (targetSlug) {
			const target = await getSpaceBySlug(db, targetSlug);
			if (!target || target.owner_id !== user.id) return fail(403, { error: 'You can only move a spot into a space you own' });
			if (target.id === space.id) return fail(400, { error: 'The spot is already in this space' });
			targetId = target.id;
		} else {
			return fail(400, { error: 'Choose a space' });
		}

		await moveSpotToSpace(db, spot.id, targetId);

		throw redirect(303, `/spot/${spot.slug}/edit`);
	},

	delete: async ({ params, locals, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'Server error' });

		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorised' });

		const spot = await getSpotBySlug(db, params.spotSlug);
		if (!spot) return fail(404, { error: 'Spot not found' });

		const space = await getSpaceById(db, spot.space_id);
		if (!space) return fail(404, { error: 'Space not found' });

		if (space.owner_id !== user.id && spot.owner_id !== user.id) return fail(403, { error: 'Forbidden' });

		await deactivateSpot(db, spot.id);

		throw redirect(303, `/space/${space.slug}`);
	}
};
