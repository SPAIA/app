import type { PageServerLoad } from './$types';
import { confirmEmailSignup } from '$lib/server/db/emailSignups';
import { isPlaceType } from '$lib/placeTypes';

// Landing page for the link in the /ort email: confirms the address, then
// offers to add the place right away.
export const load: PageServerLoad = async ({ url, platform }) => {
	const db = platform?.env?.DB;
	const token = url.searchParams.get('token');
	if (!db || !token) return { confirmed: false, placeType: null };

	const signup = await confirmEmailSignup(db, token);
	return {
		confirmed: signup != null,
		placeType: isPlaceType(signup?.placeType) ? signup.placeType : null
	};
};
