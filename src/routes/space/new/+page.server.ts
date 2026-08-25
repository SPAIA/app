import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	return { stadiaApiKey: platform?.env?.STADIA_API_KEY ?? '' };
};
