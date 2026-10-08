import type { PageServerLoad } from './$types';
import { FREE_HABITAT_SCANS, readHabitatScanCount } from '$lib/server/habitatScore';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	return {
		freeScans: FREE_HABITAT_SCANS,
		/** null when signed in — no limit applies. */
		scansLeft: locals.user ? null : Math.max(0, FREE_HABITAT_SCANS - readHabitatScanCount(cookies))
	};
};
