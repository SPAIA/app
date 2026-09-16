// Picks a weather provider by location: Bright Sky (DWD open data, free/
// keyless) for Germany, where DWD's station network is dense, and Visual
// Crossing (keyed, global coverage) everywhere else, where Bright Sky would
// either return nothing or a station hundreds of km away.

import * as brightSky from './brightSky';
import * as visualCrossing from './visualCrossing';
import type { WeatherObservationRow } from './brightSky';

// Germany's bounding box, padded slightly so near-border spots still get DWD
// data. A box isn't a precise country boundary, but it's dependency-free and
// good enough for choosing a provider — a few km either side of the actual
// border, coverage from both providers is comparable anyway.
const GERMANY_BOUNDS = { minLat: 47.2, maxLat: 55.2, minLng: 5.8, maxLng: 15.1 };

export function isGermany(lat: number, lng: number): boolean {
	return (
		lat >= GERMANY_BOUNDS.minLat &&
		lat <= GERMANY_BOUNDS.maxLat &&
		lng >= GERMANY_BOUNDS.minLng &&
		lng <= GERMANY_BOUNDS.maxLng
	);
}

/** Current conditions for a location — used for the live session flow. */
export async function fetchCurrentWeather(params: { lat: number; lng: number; visualCrossingApiKey: string | undefined }): Promise<WeatherObservationRow> {
	if (isGermany(params.lat, params.lng)) return brightSky.fetchCurrentWeather(params);
	if (!params.visualCrossingApiKey) throw new Error('VISUAL_CROSSING_API_KEY not configured');
	return visualCrossing.fetchCurrentWeather({ lat: params.lat, lng: params.lng, apiKey: params.visualCrossingApiKey });
}

/** Every hourly reading for one UTC day — used only by backfill. */
export async function fetchHistoricalWeather(params: {
	lat: number;
	lng: number;
	date: string;
	visualCrossingApiKey: string | undefined;
}): Promise<WeatherObservationRow[]> {
	if (isGermany(params.lat, params.lng)) return brightSky.fetchHistoricalWeather(params);
	if (!params.visualCrossingApiKey) throw new Error('VISUAL_CROSSING_API_KEY not configured');
	return visualCrossing.fetchHistoricalWeather({ lat: params.lat, lng: params.lng, date: params.date, apiKey: params.visualCrossingApiKey });
}

export { closestReading } from './brightSky';
