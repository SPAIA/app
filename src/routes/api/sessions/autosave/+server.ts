import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSession, insertSighting, getInsectTypes } from '$lib/db/queries';
import { checkSpotProximity } from '$lib/server/proximity';

interface Tap {
	name: string;
	tappedAt: string;
}

interface AutosaveBody {
	sessionId: string;
	/** Only the taps not already persisted by an earlier autosave. */
	taps: Tap[];
	totalCount: number;
	weather: string | null;
	condition: string | null;
	focalArea: string;
	lat: number | null;
	lng: number | null;
	durationMin: number;
	spaceId: number | null;
	spotId: number | null;
	spotName: string | null;
	locality: string | null;
	startedAt: string | null;
	clockOffsetMs: number;
}

/**
 * Saves an observation in progress: called on every bug tap and, while idle,
 * every 15 seconds (see $lib/sessionSave + ObserveStep). Upserts the session
 * row and appends whatever taps haven't been saved yet, so a dropped
 * connection, reload, or abandoned session never loses what's already
 * recorded. Does not mark the session complete — see /api/sessions/complete.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const env = platform?.env;
	const db = env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const body = (await request.json()) as AutosaveBody;
	const {
		sessionId,
		taps,
		totalCount,
		weather,
		condition,
		focalArea,
		lat,
		lng,
		durationMin,
		spaceId,
		spotId,
		spotName,
		locality,
		startedAt,
		clockOffsetMs
	} = body;

	if (!sessionId || !Array.isArray(taps) || !durationMin) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	const proximityError = await checkSpotProximity(db, spotId, lat, lng);
	if (proximityError) return json({ error: proximityError.error }, { status: proximityError.status });

	// Own the session straight away: the signed-in user if there is one,
	// otherwise a throwaway anonymous id — createSession's upsert keeps
	// whichever real owner was already stored rather than overwriting it with
	// a fresh anon id on every call.
	const userId = locals.user?.id ?? `anon:${crypto.randomUUID()}`;

	const insectTypes = await getInsectTypes(db);

	await createSession(db, {
		id: sessionId,
		user_id: userId,
		space_id: spaceId,
		space_name: null,
		spot_id: spotId ?? null,
		spot_name: spotName ?? null,
		locality: locality ?? null,
		weather: (weather as 'sunny' | 'partly' | 'overcast' | 'rainy') ?? null,
		condition: condition || null,
		focal_area: focalArea || null,
		lat,
		lng,
		duration_min: durationMin,
		started_at: startedAt ?? new Date().toISOString(),
		clock_offset_ms: clockOffsetMs ?? null,
		total_count: totalCount ?? taps.length
	});

	for (const tap of taps) {
		const insect = insectTypes.find((i) => i.name === tap.name);
		await insertSighting(db, sessionId, insect?.id ?? null, tap.name, tap.tappedAt);
	}

	return json({ ok: true });
};
