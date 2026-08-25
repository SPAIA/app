import { createAuthClient } from 'better-auth/svelte';
import { magicLinkClient } from 'better-auth/client/plugins';

// baseURL defaults to the current origin in the browser, which is what we want
// (the handler is mounted at /api/auth on the same app).
export const authClient = createAuthClient({
	plugins: [magicLinkClient()]
});

export const { signIn, signUp, signOut, useSession } = authClient;
