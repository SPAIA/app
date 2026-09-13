import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins/magic-link';
import { bearer } from 'better-auth/plugins/bearer';
import { D1Dialect } from 'kysely-d1';
import type { D1Database } from '$lib/db/queries';

export interface AuthEnv {
	DB: D1Database;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	RESEND_API_KEY: string;
	EMAIL_FROM: string;
}

async function sendMagicLinkEmail(env: AuthEnv, to: string, url: string) {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: env.EMAIL_FROM,
			to,
			subject: 'Your SPAIA sign-in link 🐛',
			html: `
				<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
					<p style="font-size:32px;margin:0 0 8px">🐛</p>
					<h1 style="font-size:20px;margin:0 0 16px">Sign in to SPAIA</h1>
					<p style="color:#444;line-height:1.5">Tap the button below to sign in. This link expires in 5 minutes and can only be used once.</p>
					<p style="margin:24px 0">
						<a href="${url}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">Sign in</a>
					</p>
					<p style="color:#888;font-size:13px;line-height:1.5">If the button doesn't work, paste this link into your browser:<br>${url}</p>
					<p style="color:#aaa;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
				</div>`
		})
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Resend send failed (${res.status}): ${detail}`);
	}
}

/**
 * Build a Better Auth instance for the current request.
 *
 * On Cloudflare the D1 binding only exists per-request (platform.env.DB), so the
 * auth instance can't be created at module load — it's constructed here from env.
 */
export function getAuth(env: AuthEnv, requestURL?: URL) {
	// Derive baseURL from the incoming request's own origin rather than a fixed
	// env var, so the app works correctly under multiple custom domains
	// (e.g. bugmeister.spaia.earth and app.spaia.earth both point at this
	// worker). This keeps magic-link emails, the origin/CSRF check, and the
	// session cookie all on whichever host the user is actually using.
	const baseURL = requestURL ? requestURL.origin : env.BETTER_AUTH_URL;
	return betterAuth({
		secret: env.BETTER_AUTH_SECRET,
		baseURL,
		database: {
			// Our D1Database is a hand-rolled minimal interface; D1Dialect wants the
			// full @cloudflare/workers-types one. Same object at runtime — cast across.
			dialect: new D1Dialect({
				database: env.DB as unknown as ConstructorParameters<typeof D1Dialect>[0]['database']
			}),
			type: 'sqlite'
		},
		advanced: {
			database: {
				// Better Auth's schema check introspects via sqlite_master, which
				// D1 (local and remote) rejects with SQLITE_AUTH -- and since getAuth()
				// builds a fresh instance per request, it would re-run on every call.
				// Our migrations are the source of truth, so skip it.
				validateSchema: false
			}
		},
		emailAndPassword: {
			enabled: true
		},
		session: {
			// Default is 7 days w/ a 24h rolling refresh window, which logs users
			// out surprisingly fast if they don't visit daily. Extend both.
			expiresIn: 60 * 60 * 24 * 30, // 30 days
			updateAge: 60 * 60 * 24 * 7 // refresh if active within the last 7 days
		},
		plugins: [
			magicLink({
				expiresIn: 300, // 5 minutes
				sendMagicLink: async ({ email, url }) => {
					await sendMagicLinkEmail(env, email, url);
				}
			}),
			// Lets native/Capacitor clients use Authorization: Bearer <token>
			// instead of cookies once the iOS wrapper ships.
			bearer()
		]
	});
}

export type Auth = ReturnType<typeof getAuth>;
