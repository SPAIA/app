import type { Space, Spot } from '$lib/types';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Nearest space with known coordinates to the given point, or null if none have coordinates. */
export function findNearestSpace(spaces: Space[], lat: number, lng: number): { space: Space; distanceKm: number } | null {
	let nearest: { space: Space; distanceKm: number } | null = null;

	for (const space of spaces) {
		if (space.lat == null || space.lng == null) continue;
		const distanceKm = haversineKm(lat, lng, space.lat, space.lng);
		if (!nearest || distanceKm < nearest.distanceKm) {
			nearest = { space, distanceKm };
		}
	}

	return nearest;
}

/** A "Get directions" link that opens the device's map app pointed at (lat, lng). */
export function directionsUrl(lat: number, lng: number): string {
	return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Short human-readable distance: metres under 1km, one decimal of km beyond that. */
export function formatDistanceKm(km: number): string {
	return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/** Nearest spot with known coordinates to the given point, or null if none have coordinates. */
export function findNearestSpot(spots: Spot[], lat: number, lng: number): { spot: Spot; distanceKm: number } | null {
	let nearest: { spot: Spot; distanceKm: number } | null = null;

	for (const spot of spots) {
		if (spot.lat == null || spot.lng == null) continue;
		const distanceKm = haversineKm(lat, lng, spot.lat, spot.lng);
		if (!nearest || distanceKm < nearest.distanceKm) {
			nearest = { spot, distanceKm };
		}
	}

	return nearest;
}
