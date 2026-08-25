import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createSession,
	completeSession,
	insertSighting,
	getProfile,
	upsertProfile,
	getInsectTypes,
	getSpotById
} from '$lib/db/queries';
import { updateStreak } from '$lib/gamification';
import { haversineKm } from '$lib/geo';

/** An observation only counts if it was taken within this radius of the spot. */
const PROXIMITY_THRESHOLD_KM = 0.1;

interface Tap {
	name: string;
	tappedAt: string;
}

interface CompleteBody {
	sessionId: string;
	taps: Tap[];
	weather: string | null;
	condition: string | null;
	focalArea: string;
	lat: number | null;
	lng: number | null;
	durationMin: number;
	spaceId: number | null;
	spotId: number | null;
	spotName: string | null;
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

	// An observation only counts within 100m of its spot — re-checked here
	// since the client-side gate (see /observe/[spot-slug]) is trivial to bypass.
	if (spotId != null) {
		const spot = await getSpotById(db, spotId);
		if (!spot) return json({ error: 'Spot not found' }, { status: 404 });
		if (spot.lat != null && spot.lng != null && lat != null && lng != null) {
			const distanceKm = haversineKm(lat, lng, spot.lat, spot.lng);
			if (distanceKm > PROXIMITY_THRESHOLD_KM) {
				return json({ error: 'Too far from the spot to record this observation' }, { status: 403 });
			}
		}
	}

	// Own the session straight away: the signed-in user if there is one,
	// otherwise an anonymous owner. Anonymous sessions can later be claimed by
	// email (see /api/sessions/claim + claimSessionsByEmail).
	const userId = locals.user?.id ?? `anon:${crypto.randomUUID()}`;

	const insectTypes = await getInsectTypes(db);
	const totalCount = taps.length;

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
		// Trust the client's server-aligned start time; fall back to server now
		// only if an older client didn't send one.
		started_at: startedAt ?? new Date().toISOString(),
		clock_offset_ms: clockOffsetMs ?? null
	});

	await completeSession(db, sessionId, totalCount);

	// One row per button press, each stamped with the time it was pressed.
	for (const tap of taps) {
		const insect = insectTypes.find((i) => i.name === tap.name);
		await insertSighting(db, sessionId, insect?.id ?? null, tap.name, tap.tappedAt);
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

	return json({ sessionId });
};
