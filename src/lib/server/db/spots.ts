import type { Spot, SpotSessionComparison } from '$lib/types';
import type { D1Database, D1PreparedStatement } from './d1';

export async function getAllSpots(db: D1Database): Promise<Spot[]> {
	const result = await db
		.prepare('SELECT * FROM spots WHERE active = 1 ORDER BY name ASC')
		.all<Spot>();
	return result.results;
}

export async function getSpotsBySpace(db: D1Database, spaceId: number): Promise<Spot[]> {
	const result = await db
		.prepare('SELECT * FROM spots WHERE space_id = ? AND active = 1 ORDER BY name ASC')
		.bind(spaceId)
		.all<Spot>();
	return result.results;
}

/** Spot slugs are unique across the whole app — they address /observe/[slug] directly. */
export async function getSpotBySlug(
	db: D1Database,
	slug: string
): Promise<(Spot & { locality: string }) | null> {
	return db
		.prepare(`
			SELECT sp.*, sc.locality as locality
			FROM spots sp
			JOIN spaces sc ON sc.id = sp.space_id
			WHERE sp.slug = ? AND sp.active = 1
		`)
		.bind(slug)
		.first<Spot & { locality: string }>();
}

export async function getSpotById(db: D1Database, spotId: number): Promise<Spot | null> {
	return db.prepare('SELECT * FROM spots WHERE id = ?').bind(spotId).first<Spot>();
}

/** All spots a user owns, regardless of who owns the space they sit in. */
export async function getSpotsByOwner(
	db: D1Database,
	ownerId: string
): Promise<Array<Spot & { space_slug: string; space_name: string }>> {
	const result = await db
		.prepare(`
			SELECT sp.*, sc.slug as space_slug, sc.name as space_name
			FROM spots sp
			JOIN spaces sc ON sc.id = sp.space_id
			WHERE sp.owner_id = ? AND sp.active = 1
			ORDER BY sp.name ASC
		`)
		.bind(ownerId)
		.all<Spot & { space_slug: string; space_name: string }>();
	return result.results;
}

/** Every located spot, with its parent space's name — for the /explore full-screen map. */
export async function getSpotsForMap(
	db: D1Database
): Promise<Array<Spot & { space_name: string }>> {
	const result = await db
		.prepare(`
			SELECT sp.*, sc.name as space_name
			FROM spots sp
			JOIN spaces sc ON sc.id = sp.space_id
			WHERE sp.active = 1 AND sc.active = 1 AND sp.lat IS NOT NULL AND sp.lng IS NOT NULL
			ORDER BY sp.name ASC
		`)
		.all<Spot & { space_name: string }>();
	return result.results;
}

export interface SpotSummary {
	observationCount: number;
	lastObservedAt: string | null;
	topInsects: { name: string; icon: string | null; count: number }[];
	totalMinutesObserved: number;
	insectCounts: { name: string; icon: string | null; count: number }[];
}

/** Stats shown on a spot's map card: how many observations, when last, what's most seen. */
export async function getSpotSummary(db: D1Database, spotId: number): Promise<SpotSummary> {
	const stats = await db
		.prepare(`
			SELECT COUNT(se.id) as observation_count, MAX(se.completed_at) as last_observed_at, sp.total_minutes_observed as total_minutes_observed
			FROM spots sp
			LEFT JOIN sessions se ON se.spot_id = sp.id AND se.completed_at IS NOT NULL
			WHERE sp.id = ?
			GROUP BY sp.id
		`)
		.bind(spotId)
		.first<{ observation_count: number; last_observed_at: string | null; total_minutes_observed: number }>();

	const insects = await db
		.prepare(`
			SELECT insect_name as name, it.icon as icon, total_count as count
			FROM spot_insect_stats sis
			LEFT JOIN insect_types it ON sis.insect_type_id = it.id
			WHERE sis.spot_id = ?
			ORDER BY count DESC
		`)
		.bind(spotId)
		.all<{ name: string; icon: string | null; count: number }>();

	return {
		observationCount: stats?.observation_count ?? 0,
		lastObservedAt: stats?.last_observed_at ?? null,
		topInsects: insects.results.slice(0, 3),
		totalMinutesObserved: stats?.total_minutes_observed ?? 0,
		insectCounts: insects.results
	};
}

/**
 * Compares one just-finished session against the spot's history (any user):
 * the previous session, and the average across every prior completed one.
 * Called once at completion so the summary screen can say "more/fewer than
 * last time" — the session being compared against is excluded from both.
 */
export async function getSpotSessionComparison(
	db: D1Database,
	spotId: number,
	excludeSessionId: string
): Promise<SpotSessionComparison> {
	const last = await db
		.prepare(`
			SELECT total_count, duration_min, completed_at
			FROM sessions
			WHERE spot_id = ? AND completed_at IS NOT NULL AND id != ?
			ORDER BY completed_at DESC
			LIMIT 1
		`)
		.bind(spotId, excludeSessionId)
		.first<{ total_count: number; duration_min: number; completed_at: string }>();

	const agg = await db
		.prepare(`
			SELECT COUNT(*) as prior_count, AVG(total_count) as avg_count, AVG(duration_min) as avg_duration
			FROM sessions
			WHERE spot_id = ? AND completed_at IS NOT NULL AND id != ?
		`)
		.bind(spotId, excludeSessionId)
		.first<{ prior_count: number; avg_count: number | null; avg_duration: number | null }>();

	return {
		priorSessionCount: agg?.prior_count ?? 0,
		lastSession: last
			? { totalCount: last.total_count, durationMin: last.duration_min, completedAt: last.completed_at }
			: null,
		average:
			agg && agg.prior_count > 0
				? { totalCount: agg.avg_count ?? 0, durationMin: agg.avg_duration ?? 0 }
				: null
	};
}

/**
 * Recomputes a spot's derived aggregates (spot_insect_stats,
 * total_minutes_observed) from canonical sessions/sightings, rather than
 * mutating them incrementally. Called as part of every syncSessionSnapshot
 * for a spot — idempotent by construction, so a repeated or out-of-order
 * sync can never leave these double-counted (see 0027_sightings_dedupe.sql
 * for the drift this used to cause with ±1 mutation). Must run after the
 * session's own sightings have been reconciled in the same batch.
 */
export function recomputeSpotAggregates(db: D1Database, spotId: number): D1PreparedStatement[] {
	return [
		db.prepare('DELETE FROM spot_insect_stats WHERE spot_id = ?').bind(spotId),
		db
			.prepare(`
				INSERT INTO spot_insect_stats (spot_id, insect_type_id, insect_name, total_count)
				SELECT se.spot_id, MAX(si.insect_type_id), si.insect_name, COUNT(*)
				FROM sightings si
				JOIN sessions se ON se.id = si.session_id
				WHERE se.spot_id = ?
				GROUP BY si.insect_name
			`)
			.bind(spotId),
		db
			.prepare(`
				UPDATE spots
				SET total_minutes_observed = (
					SELECT COALESCE(SUM(duration_min), 0) FROM sessions WHERE spot_id = ? AND completed_at IS NOT NULL
				)
				WHERE id = ?
			`)
			.bind(spotId, spotId)
	];
}

/** The spot an order already paid for, if any — stops one order minting two spots. */
export async function getSpotByOrderId(db: D1Database, orderId: string): Promise<Spot | null> {
	return db.prepare('SELECT * FROM spots WHERE order_id = ?').bind(orderId).first<Spot>();
}

export async function updateSpotFields(
	db: D1Database,
	spotId: number,
	fields: { name: string; icon: string; lat: number | null; lng: number | null }
): Promise<void> {
	await db
		.prepare('UPDATE spots SET name = ?, icon = ?, lat = ?, lng = ? WHERE id = ?')
		.bind(fields.name, fields.icon, fields.lat, fields.lng, spotId)
		.run();
}

export async function createSpot(
	db: D1Database,
	spot: Pick<Spot, 'space_id' | 'slug' | 'name' | 'icon' | 'lat' | 'lng'> & Partial<Pick<Spot, 'owner_id' | 'order_id'>>
): Promise<number> {
	const result = await db
		.prepare(`
			INSERT INTO spots (space_id, slug, name, icon, lat, lng, owner_id, order_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			spot.space_id,
			spot.slug,
			spot.name,
			spot.icon,
			spot.lat,
			spot.lng,
			spot.owner_id ?? null,
			spot.order_id ?? null
		)
		.run() as { success: boolean; meta: { last_row_id: number } };
	return result.meta.last_row_id;
}

/** Renames a spot (and re-slugs it), e.g. when the user edits the AI-suggested name. */
export async function renameSpot(db: D1Database, spotId: number, name: string, slug: string): Promise<void> {
	await db.prepare('UPDATE spots SET name = ?, slug = ? WHERE id = ?').bind(name, slug, spotId).run();
}

/** Renames the spot and stores its DeepSeek Vision read — for a spot's very first photo. */
export async function updateSpotVisionResult(
	db: D1Database,
	spotId: number,
	fields: { slug: string; name: string; aiDescription: string }
): Promise<void> {
	await db
		.prepare('UPDATE spots SET slug = ?, name = ?, ai_description = ? WHERE id = ?')
		.bind(fields.slug, fields.name, fields.aiDescription, spotId)
		.run();
}

/** Refreshes the stored scene read on a repeat visit — the name/slug stay put once set. */
export async function refreshSpotAiDescription(db: D1Database, spotId: number, aiDescription: string): Promise<void> {
	await db.prepare('UPDATE spots SET ai_description = ? WHERE id = ?').bind(aiDescription, spotId).run();
}

export async function getAllSpotsForExport(db: D1Database): Promise<Record<string, unknown>[]> {
	const result = await db.prepare('SELECT * FROM spots ORDER BY id ASC').all<Record<string, unknown>>();
	return result.results;
}
