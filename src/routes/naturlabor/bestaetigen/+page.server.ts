import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Links in confirmation emails sent before the /ort flow existed point here.
export const load: PageServerLoad = async ({ url }) => {
	throw redirect(301, `/ort/bestaetigen${url.search}`);
};
