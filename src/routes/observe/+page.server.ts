import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const stadiaApiKey = platform?.env?.STADIA_API_KEY ?? '';
	return { stadiaApiKey };
};
