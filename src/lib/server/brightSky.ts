// Real weather from Bright Sky (https://brightsky.dev) — a free, no-key JSON
// API over DWD's (Deutscher Wetterdienst) open station-observation data.
// Replaces the old approach of asking DeepSeek Vision to guess weather off
// the spot photo: real station data is more accurate, doesn't need a photo,
// and works for a backfill of past sessions (the /weather endpoint below).

const BASE_URL = 'https://api.brightsky.dev';

/** A single hourly (or current) reading, in Bright Sky's default `units=dwd` shape. */
export interface BrightSkyReading {
	timestamp: string;
	source_id: number;
	condition: string | null; // 'dry' | 'fog' | 'rain' | 'sleet' | 'snow' | 'hail' | 'thunderstorm'
	icon: string | null;
	temperature: number | null; // °C
	precipitation: number | null; // mm
	wind_speed: number | null; // km/h
	wind_gust_speed: number | null; // km/h
	cloud_cover: number | null; // %
	sunshine: number | null; // min
	relative_humidity: number | null; // %
	pressure_msl: number | null; // hPa
}

/**
 * /current_weather reports precipitation/wind/sunshine as rolling windows
 * (last 10/30/60 min) instead of the flat fields /weather (historical) uses —
 * a different shape, not just missing keys. normalizeCurrentReading below
 * flattens it to the same BrightSkyReading shape everything else expects.
 */
interface CurrentWeatherRaw {
	timestamp: string;
	source_id: number;
	condition: string | null;
	icon: string | null;
	temperature: number | null;
	cloud_cover: number | null;
	relative_humidity: number | null;
	pressure_msl: number | null;
	precipitation_10: number | null;
	wind_speed_10: number | null;
	wind_gust_speed_10: number | null;
	sunshine_30: number | null;
	sunshine_60: number | null;
}

function normalizeCurrentReading(raw: CurrentWeatherRaw): BrightSkyReading {
	return {
		timestamp: raw.timestamp,
		source_id: raw.source_id,
		condition: raw.condition,
		icon: raw.icon,
		temperature: raw.temperature,
		precipitation: raw.precipitation_10,
		wind_speed: raw.wind_speed_10,
		wind_gust_speed: raw.wind_gust_speed_10,
		cloud_cover: raw.cloud_cover,
		sunshine: raw.sunshine_30 ?? raw.sunshine_60 ?? null, // no _10 window for sunshine
		relative_humidity: raw.relative_humidity,
		pressure_msl: raw.pressure_msl
	};
}

interface BrightSkySource {
	id: number;
	dwd_station_id: string | null;
	station_name: string | null;
	lat: number;
	lon: number;
	distance?: number; // metres — only present on /current_weather
}

interface CurrentWeatherResponse {
	weather: CurrentWeatherRaw;
	sources: BrightSkySource[];
}

interface HistoricalWeatherResponse {
	weather: BrightSkyReading[];
	sources: BrightSkySource[];
}

export interface WeatherObservationRow {
	source: 'brightsky';
	lat: number;
	lng: number;
	observed_at: string;
	station_id: string | null;
	station_name: string | null;
	station_distance_m: number | null;
	temperature_c: number | null;
	precipitation_mm: number | null;
	wind_speed_kmh: number | null;
	wind_gust_speed_kmh: number | null;
	cloud_cover_pct: number | null;
	sunshine_min: number | null;
	relative_humidity_pct: number | null;
	pressure_msl_hpa: number | null;
	condition: string | null;
	icon: string | null;
	bucket: 'sunny' | 'partly' | 'overcast' | 'rainy';
	windy: boolean;
	raw_response: string;
}

const RAINY_CONDITIONS = new Set(['rain', 'sleet', 'snow', 'hail', 'thunderstorm']);
/** Sustained wind ≥ this reads as "windy" — Beaufort ~5, the point branches visibly move. */
const WINDY_THRESHOLD_KMH = 30;

/** Buckets a raw reading into the 4 values the UI has always shown. */
export function mapToBucket(reading: BrightSkyReading): WeatherObservationRow['bucket'] {
	if (reading.condition && RAINY_CONDITIONS.has(reading.condition)) return 'rainy';
	if (reading.icon?.startsWith('fog')) return 'overcast';
	const cloudCover = reading.cloud_cover;
	if (cloudCover == null) return 'partly';
	if (cloudCover < 25) return 'sunny';
	if (cloudCover < 70) return 'partly';
	return 'overcast';
}

export function isWindy(reading: BrightSkyReading): boolean {
	return (reading.wind_speed ?? 0) >= WINDY_THRESHOLD_KMH;
}

function nearestSource(sources: BrightSkySource[], reading: BrightSkyReading): BrightSkySource | null {
	return sources.find((s) => s.id === reading.source_id) ?? sources[0] ?? null;
}

// D1 rejects `undefined` bind values outright (it only accepts null), and the
// API is free to omit a key entirely rather than send it as null — so every
// field pulled off a raw reading gets coerced here, not just typed as
// nullable.
function orNull<T>(value: T | null | undefined): T | null {
	return value ?? null;
}

function toRow(reading: BrightSkyReading, sources: BrightSkySource[], lat: number, lng: number): WeatherObservationRow {
	const source = nearestSource(sources, reading);
	return {
		source: 'brightsky',
		lat,
		lng,
		observed_at: reading.timestamp,
		station_id: orNull(source?.dwd_station_id),
		station_name: orNull(source?.station_name),
		station_distance_m: orNull(source?.distance),
		temperature_c: orNull(reading.temperature),
		precipitation_mm: orNull(reading.precipitation),
		wind_speed_kmh: orNull(reading.wind_speed),
		wind_gust_speed_kmh: orNull(reading.wind_gust_speed),
		cloud_cover_pct: orNull(reading.cloud_cover),
		sunshine_min: orNull(reading.sunshine),
		relative_humidity_pct: orNull(reading.relative_humidity),
		pressure_msl_hpa: orNull(reading.pressure_msl),
		condition: orNull(reading.condition),
		icon: orNull(reading.icon),
		bucket: mapToBucket(reading),
		windy: isWindy(reading),
		raw_response: JSON.stringify(reading)
	};
}

/** Current conditions for a location — used for the live session flow. */
export async function fetchCurrentWeather(params: { lat: number; lng: number }): Promise<WeatherObservationRow> {
	const url = `${BASE_URL}/current_weather?lat=${params.lat}&lon=${params.lng}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Bright Sky current_weather failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as CurrentWeatherResponse;
	return toRow(normalizeCurrentReading(data.weather), data.sources, params.lat, params.lng);
}

/**
 * Every hourly reading for one UTC day — used only by backfill. The caller
 * picks whichever record is closest to the session's actual start time.
 */
export async function fetchHistoricalWeather(params: { lat: number; lng: number; date: string }): Promise<WeatherObservationRow[]> {
	const url = `${BASE_URL}/weather?lat=${params.lat}&lon=${params.lng}&date=${params.date}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Bright Sky weather failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as HistoricalWeatherResponse;
	return data.weather.map((reading) => toRow(reading, data.sources, params.lat, params.lng));
}

/** Picks whichever reading's timestamp is closest to `targetIso`. */
export function closestReading<T extends { observed_at: string }>(rows: T[], targetIso: string): T | null {
	if (rows.length === 0) return null;
	const target = new Date(targetIso).getTime();
	return rows.reduce((closest, row) => {
		const diff = Math.abs(new Date(row.observed_at).getTime() - target);
		const closestDiff = Math.abs(new Date(closest.observed_at).getTime() - target);
		return diff < closestDiff ? row : closest;
	});
}
