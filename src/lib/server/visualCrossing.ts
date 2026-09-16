// Real weather from Visual Crossing (https://www.visualcrossing.com) — a
// keyed JSON API with good global station/model coverage. Used for
// non-German locations, where Bright Sky's DWD stations are sparse or
// absent; see $lib/server/weather for the German/non-German dispatch.

import type { WeatherObservationRow } from './brightSky';
import { WINDY_THRESHOLD_KMH } from './brightSky';

const BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

/** Shared fields across `currentConditions` and each entry of `days[].hours`, in `unitGroup=metric`. */
interface VisualCrossingReading {
	datetimeEpoch: number;
	temp: number | null;
	precip: number | null;
	windspeed: number | null; // km/h
	windgust: number | null; // km/h
	cloudcover: number | null; // %
	humidity: number | null; // %
	pressure: number | null; // hPa
	conditions: string | null;
	icon: string | null; // e.g. 'clear-day', 'rain', 'snow', 'fog', 'wind'
	preciptype: string[] | null;
}

interface VisualCrossingResponse {
	days: { datetime: string; hours: VisualCrossingReading[] }[];
	currentConditions?: VisualCrossingReading;
}

const RAINY_ICON_PATTERNS = ['rain', 'snow', 'sleet', 'thunder'];

/** Buckets a raw reading into the 4 values the UI has always shown — same thresholds as Bright Sky's mapToBucket, adapted to Visual Crossing's icon vocabulary. */
export function mapToBucket(reading: VisualCrossingReading): WeatherObservationRow['bucket'] {
	const icon = reading.icon ?? '';
	if (RAINY_ICON_PATTERNS.some((p) => icon.includes(p))) return 'rainy';
	if (icon.includes('fog')) return 'overcast';
	const cloudCover = reading.cloudcover;
	if (cloudCover == null) return 'partly';
	if (cloudCover < 25) return 'sunny';
	if (cloudCover < 70) return 'partly';
	return 'overcast';
}

export function isWindy(reading: VisualCrossingReading): boolean {
	return (reading.windspeed ?? 0) >= WINDY_THRESHOLD_KMH;
}

function orNull<T>(value: T | null | undefined): T | null {
	return value ?? null;
}

function toRow(reading: VisualCrossingReading, lat: number, lng: number): WeatherObservationRow {
	return {
		source: 'visualcrossing',
		lat,
		lng,
		observed_at: new Date(reading.datetimeEpoch * 1000).toISOString(),
		// Visual Crossing blends multiple stations/models per point rather than
		// naming one station the way Bright Sky does, so there's no equivalent
		// to report here.
		station_id: null,
		station_name: null,
		station_distance_m: null,
		temperature_c: orNull(reading.temp),
		precipitation_mm: orNull(reading.precip),
		wind_speed_kmh: orNull(reading.windspeed),
		wind_gust_speed_kmh: orNull(reading.windgust),
		cloud_cover_pct: orNull(reading.cloudcover),
		sunshine_min: null, // Visual Crossing has no direct sunshine-minutes equivalent
		relative_humidity_pct: orNull(reading.humidity),
		pressure_msl_hpa: orNull(reading.pressure),
		condition: orNull(reading.conditions),
		icon: orNull(reading.icon),
		bucket: mapToBucket(reading),
		windy: isWindy(reading),
		raw_response: JSON.stringify(reading)
	};
}

/** Current conditions for a location — used for the live session flow. */
export async function fetchCurrentWeather(params: { lat: number; lng: number; apiKey: string }): Promise<WeatherObservationRow> {
	const url = `${BASE_URL}/${params.lat},${params.lng}?unitGroup=metric&include=current&key=${encodeURIComponent(params.apiKey)}&contentType=json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Visual Crossing current conditions failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as VisualCrossingResponse;
	if (!data.currentConditions) throw new Error('Visual Crossing response missing currentConditions');
	return toRow(data.currentConditions, params.lat, params.lng);
}

/**
 * Every hourly reading for one UTC day — used only by backfill. The caller
 * picks whichever record is closest to the session's actual start time.
 */
export async function fetchHistoricalWeather(params: { lat: number; lng: number; date: string; apiKey: string }): Promise<WeatherObservationRow[]> {
	const url = `${BASE_URL}/${params.lat},${params.lng}/${params.date}/${params.date}?unitGroup=metric&include=hours&key=${encodeURIComponent(params.apiKey)}&contentType=json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Visual Crossing timeline failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as VisualCrossingResponse;
	const hours = data.days[0]?.hours ?? [];
	return hours.map((reading) => toRow(reading, params.lat, params.lng));
}
