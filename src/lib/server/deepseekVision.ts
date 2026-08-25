import type { HabitatFeatureCategory, PlantRank, SpotVisionResult } from '$lib/types';

type Weather = NonNullable<SpotVisionResult['weather']>;
const WEATHER_OPTIONS: Weather[] = ['sunny', 'partly', 'overcast', 'rainy'];

const PLANT_RANKS: PlantRank[] = ['family', 'genus', 'species', 'type'];
const HABITAT_FEATURE_CATEGORIES: HabitatFeatureCategory[] = [
	'groundcover',
	'soil',
	'rock_feature',
	'woody_debris',
	'water',
	'nesting_feature',
	'vegetation_structure',
	'other'
];

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const VISION_MODEL = 'deepseek-v4-flash-vision-exp';

const SYSTEM_PROMPT = `You are an ecologist helping a citizen-scientist read a monitoring spot from a
photo taken at the start of their observation. Reply with ONLY a JSON object, no prose, shaped exactly like:
{"name": "short spot name, 2-5 words", "scene": "one short sentence describing the setting right now",
"plants": [{"name": "common name, lowercase", "rank": "family"|"genus"|"species"|"type"}],
"habitat_features": [{"category": "groundcover"|"soil"|"rock_feature"|"woody_debris"|"water"|"nesting_feature"|"vegetation_structure"|"other", "label": "short lowercase description"}],
"changes": null,
"weather": "sunny"|"partly"|"overcast"|"rainy"|null}
Give each plant the plainest common name it's known by — "oak", not "a young oak growing by the wall". Never
fold size, age, health, or position into the name; a plant's name should stay the same every time it's
photographed even as the plant itself changes, since it's matched against previous visits by that name.
Anything descriptive like that belongs in "scene" or "changes" instead.
For each plant, set "rank" to how specific your guess is: "species" only if you can confidently name one
(e.g. "English oak"), "genus" for a common name that maps to one genus (e.g. "oak", "rose"), "family" for a
broad grouping (e.g. "grasses", "ferns"), and "type" for anything vaguer (e.g. "shrub", "moss", "groundcover
plant"). Default to "type" or "genus" rather than guessing a species you're not confident of.
For habitat_features, use "groundcover" for the surface plants grow in/on (leaf litter, mulch, bare soil),
"soil" for exposed soil/mud specifically called out, "rock_feature" for stones/boulders/walls, "woody_debris"
for logs/branches/deadwood, "water" for any standing/flowing water, "nesting_feature" for anything that looks
like it could shelter a nest or burrow, "vegetation_structure" for the shape/layers of plant growth (dense
shrub layer, open canopy, etc.), and "other" for anything that doesn't fit those.
Keep "plants" and "habitat_features" to at most 6 items each. If you can't identify something precisely, still
include your best general guess rather than leaving a list empty.
"name" is only used the first time a spot is photographed — still fill it in, but don't worry about it once a
previous-visit photo is also supplied.
When a second, earlier photo of the same spot is included, compare it with the current one and set "changes" to
one short sentence on what's visibly different (growth, season, weather, disturbance) — or null if nothing stands out.
When there is no earlier photo, "changes" must be null.
For "weather", read the current conditions off the photo itself (sky, light, wet surfaces, etc.) — use null only
if the photo gives no real clue (e.g. a close-up with no sky or ground visible).`;

function buildUserPrompt(params: {
	lat: number | null;
	lng: number | null;
	locality: string | null;
	timeOfDay: string | null;
	hasPreviousImage: boolean;
}): string {
	const location =
		params.lat != null && params.lng != null
			? `Location: ${params.locality ?? 'unknown locality'} (${params.lat.toFixed(5)}, ${params.lng.toFixed(5)}).`
			: 'Location: unknown.';
	const when = params.timeOfDay ? ` Time of day: ${params.timeOfDay}.` : '';
	const compareNote = params.hasPreviousImage
		? ' The first image is from a previous visit; the second is from right now — compare them.'
		: '';
	return `${location}${when}${compareNote} Describe this monitoring spot as instructed.`;
}

interface DescribeSpotPhotoParams {
	apiKey: string;
	imageBytes: ArrayBuffer;
	mimeType: string;
	lat: number | null;
	lng: number | null;
	locality: string | null;
	timeOfDay?: string | null;
	/** A previous visit's photo of the same spot, if one exists — enables the "changes" read. */
	previousImage?: { bytes: ArrayBuffer; mimeType: string } | null;
}

/** Sends a spot photo (plus optional time/previous-visit context) to DeepSeek Vision. */
export async function describeSpotPhoto(params: DescribeSpotPhotoParams): Promise<SpotVisionResult> {
	const content: (
		| { type: 'text'; text: string }
		| { type: 'image_url'; image_url: { url: string } }
	)[] = [];

	if (params.previousImage) {
		content.push({ type: 'text', text: 'Previous visit:' });
		content.push({ type: 'image_url', image_url: { url: toDataUri(params.previousImage.bytes, params.previousImage.mimeType) } });
		content.push({ type: 'text', text: 'This visit:' });
	}
	content.push({ type: 'image_url', image_url: { url: toDataUri(params.imageBytes, params.mimeType) } });
	content.push({
		type: 'text',
		text: buildUserPrompt({
			lat: params.lat,
			lng: params.lng,
			locality: params.locality,
			timeOfDay: params.timeOfDay ?? null,
			hasPreviousImage: !!params.previousImage
		})
	});

	const res = await fetch(DEEPSEEK_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${params.apiKey}`
		},
		body: JSON.stringify({
			model: VISION_MODEL,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content }
			]
		})
	});

	if (!res.ok) {
		throw new Error(`DeepSeek Vision request failed: ${res.status} ${await res.text()}`);
	}

	const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
	const messageContent = data.choices?.[0]?.message?.content;
	if (!messageContent) throw new Error('DeepSeek Vision returned no content');

	return parseVisionResult(messageContent);
}

function parseVisionResult(content: string): SpotVisionResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new Error('DeepSeek Vision returned invalid JSON');
	}

	const obj = parsed as Record<string, unknown>;
	const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'New spot';
	const scene = typeof obj.scene === 'string' ? obj.scene.trim() : '';
	const changes = typeof obj.changes === 'string' && obj.changes.trim() ? obj.changes.trim() : null;
	const weather: Weather | null = WEATHER_OPTIONS.includes(obj.weather as Weather) ? (obj.weather as Weather) : null;

	const plants = Array.isArray(obj.plants)
		? obj.plants
				.map((p) => {
					if (typeof p !== 'object' || p === null) return null;
					const rec = p as Record<string, unknown>;
					const plantName = typeof rec.name === 'string' ? rec.name.trim().toLowerCase() : '';
					if (!plantName) return null;
					const rank: PlantRank = PLANT_RANKS.includes(rec.rank as PlantRank) ? (rec.rank as PlantRank) : 'type';
					return { name: plantName, rank };
				})
				.filter((p): p is { name: string; rank: PlantRank } => p !== null)
		: [];

	const habitatFeatures = Array.isArray(obj.habitat_features)
		? obj.habitat_features
				.map((f) => {
					if (typeof f !== 'object' || f === null) return null;
					const rec = f as Record<string, unknown>;
					const label = typeof rec.label === 'string' ? rec.label.trim().toLowerCase() : '';
					if (!label) return null;
					if (!HABITAT_FEATURE_CATEGORIES.includes(rec.category as HabitatFeatureCategory)) return null;
					return { category: rec.category as HabitatFeatureCategory, label };
				})
				.filter((f): f is { category: HabitatFeatureCategory; label: string } => f !== null)
		: [];

	return { name, scene, plants, habitat_features: habitatFeatures, changes, weather };
}

function toDataUri(buffer: ArrayBuffer, mimeType: string): string {
	return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}
