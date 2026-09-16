import type { D1Database } from '$lib/server/db/d1';
import type { R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				email: string;
				name: string;
				emailVerified: boolean;
				image?: string | null;
				createdAt: Date;
				updatedAt: Date;
			} | null;
			session: {
				id: string;
				userId: string;
				token: string;
				expiresAt: Date;
			} | null;
		}
		interface Platform {
			env: {
				DB: D1Database;
				AVATARS: R2Bucket;
				MEDIA: R2Bucket;
				BETTER_AUTH_SECRET: string;
				BETTER_AUTH_URL: string;
				RESEND_API_KEY: string;
				EMAIL_FROM: string;
				STADIA_API_KEY: string;
				DEEPSEEK_API_KEY: string;
				VISUAL_CROSSING_API_KEY: string;
				STRIPE_SECRET_KEY: string;
				STRIPE_WEBHOOK_SECRET: string;
				STRIPE_PRICE_ID: string;
			};
		}
	}
}

export {};
