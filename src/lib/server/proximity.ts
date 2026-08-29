import { getSpotById } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';
import { haversineKm } from '$lib/geo';

/** An observation only counts if it was taken within this radius of the spot. */
export const PROXIMITY_THRESHOLD_KM = 0.1;

/**
 * Re-checks proximity server-side — the client-side gate in SetupStep is
 * trivial to bypass. Returns an error to send back (with its status), or
 * `null` if the observation is close enough (or has no spot to check against).
 */
export async function checkSpotProximity(
	db: D1Database,
	spotId: number | null,
	lat: number | null,
	lng: number | null
): Promise<{ error: string; status: number } | null> {
	if (spotId == null) return null;

	const spot = await getSpotById(db, spotId);
	if (!spot) return { error: 'Spot not found', status: 404 };

	if (spot.lat != null && spot.lng != null && lat != null && lng != null) {
		const distanceKm = haversineKm(lat, lng, spot.lat, spot.lng);
		if (distanceKm > PROXIMITY_THRESHOLD_KM) {
			return { error: 'Too far from the spot to record this observation', status: 403 };
		}
	}

	return null;
}
