import type { PlantRank, HabitatFeatureCategory, PlantObservationSource } from '$lib/types';
import { normalizePlantName, findBestNameMatch } from '$lib/textMatch';
import type { D1Database } from './d1';

/**
 * Finds a plant to attach an AI-guessed name to, or creates one. Matching is
 * done in the app, not the prompt: the DeepSeek call never sees the existing
 * catalog (that would only grow the prompt forever), so instead this
 * compares the guess against every existing common name in this language —
 * cheap even at a few thousand rows — and reuses whichever plant scores best,
 * rather than minting a near-duplicate for "oak" vs "oak tree" vs "an oak".
 * A near-miss phrasing gets recorded as an extra name on the matched plant,
 * so the exact-match fast path catches it next time. Below the threshold
 * (true synonyms like "conifer" vs "evergreen", or anything genuinely new),
 * it creates a fresh plant — that's the honest failure mode of string
 * similarity; closing it needs GBIF/Pl@ntNet-backed identification, not more
 * string matching.
 */
export async function findOrCreatePlant(
	db: D1Database,
	params: { name: string; rank: PlantRank; language: string; source: string }
): Promise<number> {
	const normalized = normalizePlantName(params.name);

	const exact = await db
		.prepare("SELECT plant_id FROM plant_names WHERE language = ? AND name_type = 'common' AND lower(name) = ?")
		.bind(params.language, normalized)
		.first<{ plant_id: number }>();
	if (exact) return exact.plant_id;

	const candidates = await db
		.prepare("SELECT plant_id, name FROM plant_names WHERE language = ? AND name_type = 'common'")
		.bind(params.language)
		.all<{ plant_id: number; name: string }>();

	const match = findBestNameMatch(normalized, candidates.results);
	if (match) {
		await db
			.prepare('INSERT OR IGNORE INTO plant_names (plant_id, language, name_type, name, source) VALUES (?, ?, ?, ?, ?)')
			.bind(match.plant_id, params.language, 'common', normalized, params.source)
			.run();
		return match.plant_id;
	}

	const plantResult = (await db
		.prepare('INSERT INTO plants (rank) VALUES (?)')
		.bind(params.rank)
		.run()) as { success: boolean; meta: { last_row_id: number } };
	const plantId = plantResult.meta.last_row_id;

	await db
		.prepare('INSERT INTO plant_names (plant_id, language, name_type, name, is_preferred, source) VALUES (?, ?, ?, ?, 1, ?)')
		.bind(plantId, params.language, 'common', normalized, params.source)
		.run();

	return plantId;
}

export async function recordHabitatFeatures(
	db: D1Database,
	params: { spotId: number; mediaId: string; features: { category: HabitatFeatureCategory; label: string }[]; source: string }
): Promise<void> {
	for (const feature of params.features) {
		await db
			.prepare('INSERT INTO habitat_features (spot_id, media_id, category, label, source) VALUES (?, ?, ?, ?, ?)')
			.bind(params.spotId, params.mediaId, feature.category, feature.label, params.source)
			.run();
	}
}

export async function recordPlantObservations(
	db: D1Database,
	params: { spotId: number; mediaId: string; plants: { plantId: number; confidence: number | null }[]; source: PlantObservationSource }
): Promise<void> {
	for (const plant of params.plants) {
		await db
			.prepare('INSERT INTO plant_observations (spot_id, media_id, plant_id, confidence, source) VALUES (?, ?, ?, ?, ?)')
			.bind(params.spotId, params.mediaId, plant.plantId, plant.confidence, params.source)
			.run();
	}
}

/** Drops a photo's habitat-feature reads so an edited set can replace them. */
export async function deleteHabitatFeaturesForMedia(db: D1Database, spotId: number, mediaId: string): Promise<void> {
	await db.prepare('DELETE FROM habitat_features WHERE spot_id = ? AND media_id = ?').bind(spotId, mediaId).run();
}

/** Drops a photo's plant observations so an edited set can replace them. */
export async function deletePlantObservationsForMedia(db: D1Database, spotId: number, mediaId: string): Promise<void> {
	await db.prepare('DELETE FROM plant_observations WHERE spot_id = ? AND media_id = ?').bind(spotId, mediaId).run();
}
