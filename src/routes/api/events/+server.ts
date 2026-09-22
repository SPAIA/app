import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { logEvent } from '$lib/server/analytics';

const EventSchema = z.object({
	name: z.string().min(1).max(100),
	path: z.string().max(500).nullable().optional(),
	visitorId: z.string().max(100).nullable().optional(),
	props: z.record(z.string(), z.unknown()).nullable().optional()
});

/** Fire-and-forget event beacon — see $lib/analytics/track. Never trusts userId from the client. */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const analytics = platform?.env?.ANALYTICS;
	if (!analytics) return json({ error: 'Analytics unavailable' }, { status: 503 });

	const body = await request.json().catch(() => null);
	const parsed = EventSchema.safeParse(body);
	if (!parsed.success) return json({ error: 'Invalid event' }, { status: 400 });

	// Non-blocking by design — writeDataPoint doesn't return a promise worth awaiting.
	logEvent(analytics, {
		name: parsed.data.name,
		path: parsed.data.path ?? null,
		visitorId: parsed.data.visitorId ?? null,
		userId: locals.user?.id ?? null,
		props: parsed.data.props ?? null
	});

	return json({ ok: true });
};
