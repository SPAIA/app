import type { RequestHandler } from './$types';
import { getAuth, type AuthEnv } from '$lib/auth';
import { error } from '@sveltejs/kit';

const handler: RequestHandler = ({ request, platform }) => {
	const env = platform?.env as AuthEnv | undefined;
	if (!env?.DB) throw error(503, 'Auth unavailable');
	return getAuth(env).handler(request);
};

export const GET = handler;
export const POST = handler;
