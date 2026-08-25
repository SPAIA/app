import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Lightweight time beacon. Cloudflare's clock is NTP-disciplined, so this is
// the authoritative UTC reference the phone aligns itself to (so taps line up
// with the NTP-synced site camera). Keep it tiny and uncacheable.
export const GET: RequestHandler = () => {
	return json(
		{ now: Date.now() },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
