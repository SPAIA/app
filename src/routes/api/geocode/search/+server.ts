import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchAddress } from '$lib/server/geocode';

export const GET: RequestHandler = async ({ url }) => {
	const text = url.searchParams.get('text')?.trim();
	if (!text) return json({ results: [] });

	const focusLat = Number(url.searchParams.get('lat'));
	const focusLng = Number(url.searchParams.get('lng'));
	const focus =
		Number.isFinite(focusLat) && Number.isFinite(focusLng)
			? { lat: focusLat, lng: focusLng }
			: undefined;

	const results = await searchAddress(text, focus);
	return json({ results });
};
