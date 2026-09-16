import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createSession,
	completeSession,
	insertSighting,
	incrementSpotInsectCount,
	addSpotMinutesObserved,
	getSpotSessionComparison,
	getProfile,
	upsertProfile,
	getInsectTypes,
	recordSessionCreatures
} from '$lib/db/queries';
import { updateStreak } from '$lib/gamification';

interface Tap {
	name: string;
	tappedAt: string;
}

interface CompleteBody {
	sessionId: string;
	/** Only the taps not already persisted by an earlier autosave — see $lib/sessionSave. */
	taps: Tap[];
	/** Authoritative running total (taps here is just the delta, not the full count). */
	totalCount: number;
	weather: string | null;
	weatherObservationId: number | null;
	condition: string | null;
	notes: string | null;
	windObserved: string | null;
	/** Incidental wildlife spotted — mice, snails, and so on. Written once here, not autosaved. */
	otherCreatures: { creature: string; label: string | null }[];
	focalArea: string;
	lat: number | null;
	lng: number | null;
	durationMin: number;
	spaceId: number | null;
	spotId: number | null;
	/** Locality reverse-geocoded from the session GPS fix, if any. */
	locality: string | null;
	/** Server-aligned ISO start time (already corrected for device clock skew). */
	startedAt: string | null;
	/** Offset applied client-side to align to server time, kept for provenance. */
	clockOffsetMs: number;
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const env = platform?.env;
	const db = env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const body = (await request.json()) as CompleteBody;
	const {
		sessionId,
		taps,
		totalCount,
		weather,
		weatherObservationId,
		condition,
		notes,
		windObserved,
		otherCreatures,
		focalArea,
		lat,
		lng,
		durationMin,
		spaceId,
		spotId,
		locality,
		startedAt,
		clockOffsetMs
	} = body;

	if (!sessionId || !Array.isArray(taps) || !durationMin) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	// Own the session straight away: the signed-in user if there is one,
	// otherwise an anonymous owner. Anonymous sessions can later be claimed by
	// email (see /api/sessions/claim + claimSessionsByEmail) or, once the
	// observer signs in on any page, automatically (see /api/sessions/claim-local).
	const userId = locals.user?.id ?? `anon:${crypto.randomUUID()}`;

	const insectTypes = await getInsectTypes(db);
	const finalTotalCount = totalCount ?? taps.length;

	await createSession(db, {
		id: sessionId,
		user_id: userId,
		space_id: spaceId,
		spot_id: spotId ?? null,
		locality: locality ?? null,
		weather: (weather as 'sunny' | 'partly' | 'overcast' | 'rainy') ?? null,
		weather_observation_id: weatherObservationId ?? null,
		condition: condition || null,
		notes: notes || null,
		wind_observed: (windObserved as 'still' | 'light_breeze' | 'leaves_moving' | 'branches_moving') || null,
		focal_area: focalArea || null,
		lat,
		lng,
		duration_min: durationMin,
		// Trust the client's server-aligned start time; fall back to server now
		// only if an older client didn't send one.
		started_at: startedAt ?? new Date().toISOString(),
		clock_offset_ms: clockOffsetMs ?? null,
		total_count: finalTotalCount
	});

	await completeSession(db, sessionId, finalTotalCount);
	if (spotId) await addSpotMinutesObserved(db, spotId, durationMin);
	if (Array.isArray(otherCreatures) && otherCreatures.length) {
		await recordSessionCreatures(db, sessionId, otherCreatures);
	}

	// One row per button press, each stamped with the time it was pressed.
	for (const tap of taps) {
		const insect = insectTypes.find((i) => i.name === tap.name);
		const inserted = await insertSighting(db, sessionId, insect?.id ?? null, tap.name, tap.tappedAt);
		// A resent tap (see insertSighting) already counted the first time it landed.
		if (inserted && spotId) await incrementSpotInsectCount(db, spotId, insect?.id ?? null, tap.name);
	}

	// Streak is a signed-in feature; don't create junk profiles for anon owners.
	if (locals.user) {
		const profile = await getProfile(db, userId);
		const { newStreak, newLastDate } = updateStreak(
			profile?.streak_days ?? 0,
			profile?.streak_last_date ?? null
		);
		await upsertProfile(db, userId, {
			streak_days: newStreak,
			streak_last_date: newLastDate
		});
	}

	// How this session compares to the spot's history, from any user — shown
	// on the summary screen ("more/fewer than last time").
	const comparison = spotId ? await getSpotSessionComparison(db, spotId, sessionId) : null;

	return json({ sessionId, comparison });
};
