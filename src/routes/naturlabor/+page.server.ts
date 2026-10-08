import type { PageServerLoad } from './$types';
import { getSpotBySlug, getSpotObservationTotals } from '$lib/server/db/spots';

const NATURLABOR_SPOT_SLUG = 'naturlabor';

// The scripted habitat read is fixed, but the "Und die Insekten?" numbers are
// the Naturlabor spot's real observation totals.
export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	const spot = db ? await getSpotBySlug(db, NATURLABOR_SPOT_SLUG) : null;
	return {
		spotSlug: spot?.slug ?? null,
		totals: db && spot ? await getSpotObservationTotals(db, spot.id) : null
	};
};
