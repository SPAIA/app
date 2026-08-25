import type { Handle } from '@sveltejs/kit';
import { getAuth, type AuthEnv } from '$lib/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env as AuthEnv | undefined;

	event.locals.user = null;
	event.locals.session = null;

	if (env?.DB && env.BETTER_AUTH_SECRET) {
		try {
			const auth = getAuth(env);
			const data = await auth.api.getSession({ headers: event.request.headers });
			if (data) {
				event.locals.user = data.user as App.Locals['user'];
				event.locals.session = data.session as App.Locals['session'];
			}
		} catch (e) {
			console.error('getSession failed', e);
		}
	}

	return resolve(event);
};
