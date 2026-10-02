/**
 * Worker entry: SvelteKit's generated worker handles every request, and this
 * adds the cron-triggered `scheduled` handler it has no slot for (crons are
 * set in wrangler.jsonc). Bundled by wrangler, which resolves `$lib` through
 * the `alias` there — this file sits outside SvelteKit's build.
 */
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';
import { completeExpiredSessions } from '$lib/server/db/sessions';
import type { D1Database } from '$lib/server/db/d1';

interface Env {
	DB: D1Database;
}

export default {
	...sveltekit,
	async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
		ctx.waitUntil(
			completeExpiredSessions(env.DB).then((n) => {
				if (n > 0) console.log(`completed ${n} expired session(s)`);
			})
		);
	}
};
