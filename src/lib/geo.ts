import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { Polygon, MultiPolygon } from 'geojson';
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

/**
 * The space whose drawn boundary contains this point, or null if none does
 * (including when no space has a boundary at all yet).
 */
export function findContainingSpace(spaces: Space[], lat: number, lng: number): Space | null {
	const pt = turfPoint([lng, lat]);

	for (const space of spaces) {
		if (!space.boundary_geojson) continue;
		let geometry: Polygon | MultiPolygon;
		try {
			geometry = JSON.parse(space.boundary_geojson);
		} catch {
			continue;
		}
		if (booleanPointInPolygon(pt, geometry)) return space;
	}

	return null;
}

/** A "Get directions" link that opens the device's map app pointed at (lat, lng). */
export function directionsUrl(lat: number, lng: number): string {
	return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Short human-readable distance: metres under 1km, one decimal of km beyond that. */
export function formatDistanceKm(km: number): string {
	return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/**
 * Distance as a range that accounts for the device's reported GPS accuracy (metres),
 * e.g. "30m–70m" instead of a falsely precise "50m" when the fix is only good to ±20m.
 * Falls back to a single value when accuracy is unknown.
 */
export function formatDistanceRange(km: number, accuracyMeters: number | null | undefined): string {
	if (accuracyMeters == null || accuracyMeters <= 0) return formatDistanceKm(km);

	const meters = km * 1000;
	const low = formatDistanceKm(Math.max(0, meters - accuracyMeters) / 1000);
	const high = formatDistanceKm((meters + accuracyMeters) / 1000);
	return low === high ? low : `${low}–${high}`;
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

/** Short human-readable area: m² under 1ha, otherwise hectares. */
export function formatArea(m2: number): string {
	if (m2 >= 10000) return `${(m2 / 10000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`;
	return `${Math.round(m2).toLocaleString()} m²`;
}
