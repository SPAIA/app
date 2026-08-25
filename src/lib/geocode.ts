/**
 * Resolves GPS coordinates to a locality name (e.g. "Moabit") using
 * BigDataCloud's free client-side reverse-geocoding endpoint (no API key).
 *
 * localityLanguage is pinned to German so the same place always yields the
 * same string — leaderboard rows group by this value across all users,
 * whatever UI language they browse in.
 */
export async function reverseGeocodeLocality(
	lat: number,
	lng: number
): Promise<string | null> {
	try {
		const res = await fetch(
			`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=de`
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { locality?: string; city?: string };
		return data.locality || data.city || null;
	} catch {
		return null;
	}
}

export interface ReverseGeocodeResult {
	locality: string | null;
	country: string | null;
}

/**
 * Resolves GPS coordinates to locality + country via BigDataCloud's free
 * client-side reverse-geocoding endpoint.
 *
 * Must be called from the browser, not proxied through a server: BigDataCloud's
 * fair-use policy for this free endpoint requires calls to originate directly
 * from the client using the device's current location.
 */
export async function reverseGeocode(
	lat: number,
	lng: number
): Promise<ReverseGeocodeResult | null> {
	try {
		const res = await fetch(
			`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { locality?: string; city?: string; countryName?: string };
		return {
			locality: data.locality || data.city || null,
			country: data.countryName || null
		};
	} catch {
		return null;
	}
}
