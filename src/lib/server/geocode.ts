/**
 * Server-side forward address search (for the "enter an address" flow on
 * space creation) via OpenStreetMap's Nominatim, which is free and needs no
 * API key. Reverse geocoding is done client-side instead, via BigDataCloud
 * (see $lib/geocode) — Nominatim's usage policy caps requests at 1/sec and
 * Stadia's plan doesn't include the reverse-geocoding endpoint.
 */

export interface AddressResult {
	label: string;
	locality: string | null;
	country: string | null;
	lat: number;
	lng: number;
}

interface NominatimResult {
	lat: string;
	lon: string;
	display_name: string;
	address?: {
		city?: string;
		town?: string;
		village?: string;
		hamlet?: string;
		county?: string;
		country?: string;
	};
}

export async function searchAddress(
	text: string,
	focus?: { lat: number; lng: number }
): Promise<AddressResult[]> {
	const url = new URL('https://nominatim.openstreetmap.org/search');
	url.searchParams.set('q', text);
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('addressdetails', '1');
	url.searchParams.set('limit', '5');
	if (focus) {
		// Soft bias toward the current location without restricting results to it.
		url.searchParams.set(
			'viewbox',
			`${focus.lng - 0.5},${focus.lat + 0.5},${focus.lng + 0.5},${focus.lat - 0.5}`
		);
		url.searchParams.set('bounded', '0');
	}

	const res = await fetch(url, {
		headers: { 'User-Agent': 'bugmeister.spaia.earth (space address search)' }
	});
	if (!res.ok) return [];

	const data = (await res.json()) as NominatimResult[];
	return data.map((r) => {
		const a = r.address ?? {};
		return {
			label: r.display_name,
			locality: a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county ?? null,
			country: a.country ?? null,
			lat: Number(r.lat),
			lng: Number(r.lon)
		};
	});
}
