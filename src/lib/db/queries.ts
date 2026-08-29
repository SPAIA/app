import type {
	Space,
	Spot,
	InsectType,
	LeaderboardRow,
	Profile,
	Session,
	Sighting,
	SpaceOrder,
	Media,
	MediaEntityType,
	RedeemCode,
	RedeemCodeScope,
	PlantRank,
	HabitatFeatureCategory,
	PlantObservationSource
} from '$lib/types';
import { normalizePlantName, findBestNameMatch } from '$lib/textMatch';

export interface D1Database {
	prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(column?: string): Promise<T | null>;
	all<T = unknown>(): Promise<{ results: T[] }>;
	run(): Promise<{ success: boolean; meta: unknown }>;
}

export async function getSpaceBySlug(db: D1Database, slug: string): Promise<Space | null> {
	return db
		.prepare('SELECT * FROM spaces WHERE slug = ? AND active = 1')
		.bind(slug)
		.first<Space>();
}

export async function getSpacesByOwner(db: D1Database, ownerId: string): Promise<Space[]> {
	const result = await db
		.prepare('SELECT * FROM spaces WHERE owner_id = ? AND active = 1 ORDER BY name ASC')
		.bind(ownerId)
		.all<Space>();
	return result.results;
}

export async function getAllSpaces(db: D1Database): Promise<Space[]> {
	const result = await db
		.prepare('SELECT * FROM spaces WHERE active = 1 ORDER BY name ASC')
		.all<Space>();
	return result.results;
}

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
export async function getSpotBySlug(db: D1Database, slug: string): Promise<Spot | null> {
	return db.prepare('SELECT * FROM spots WHERE slug = ? AND active = 1').bind(slug).first<Spot>();
}

export async function getSpotById(db: D1Database, spotId: number): Promise<Spot | null> {
	return db.prepare('SELECT * FROM spots WHERE id = ?').bind(spotId).first<Spot>();
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
}

/** Stats shown on a spot's map card: how many observations, when last, what's most seen. */
export async function getSpotSummary(db: D1Database, spotId: number): Promise<SpotSummary> {
	const stats = await db
		.prepare(`
			SELECT COUNT(*) as observation_count, MAX(completed_at) as last_observed_at
			FROM sessions
			WHERE spot_id = ? AND completed_at IS NOT NULL
		`)
		.bind(spotId)
		.first<{ observation_count: number; last_observed_at: string | null }>();

	const insects = await db
		.prepare(`
			SELECT si.insect_name as name, it.icon as icon, SUM(si.count) as count
			FROM sightings si
			JOIN sessions se ON si.session_id = se.id
			LEFT JOIN insect_types it ON si.insect_type_id = it.id
			WHERE se.spot_id = ?
			GROUP BY si.insect_name
			ORDER BY count DESC
			LIMIT 3
		`)
		.bind(spotId)
		.all<{ name: string; icon: string | null; count: number }>();

	return {
		observationCount: stats?.observation_count ?? 0,
		lastObservedAt: stats?.last_observed_at ?? null,
		topInsects: insects.results
	};
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

export async function getLeaderboard(db: D1Database): Promise<LeaderboardRow[]> {
	const result = await db
		.prepare(`
			SELECT
				sp.locality,
				SUM(s.total_count) AS total_sightings,
				COUNT(DISTINCT s.user_id) AS observer_count
			FROM sessions s
			JOIN spaces sp ON s.space_id = sp.id
			WHERE s.completed_at >= datetime('now', '-30 days')
			GROUP BY sp.locality
			ORDER BY total_sightings DESC
		`)
		.all<LeaderboardRow>();
	return result.results;
}

export async function getInsectTypes(db: D1Database): Promise<InsectType[]> {
	const result = await db
		.prepare('SELECT * FROM insect_types WHERE active = 1 ORDER BY sort_order ASC')
		.all<InsectType>();
	return result.results;
}

export async function getProfile(db: D1Database, userId: string): Promise<Profile | null> {
	return db
		.prepare('SELECT * FROM profiles WHERE id = ?')
		.bind(userId)
		.first<Profile>();
}

export async function upsertProfile(
	db: D1Database,
	userId: string,
	data: Partial<Profile>
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO profiles (id, display_name, home_locality, role, level, streak_days, streak_last_date)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				display_name = COALESCE(excluded.display_name, display_name),
				home_locality = COALESCE(excluded.home_locality, home_locality),
				level = COALESCE(excluded.level, level),
				streak_days = COALESCE(excluded.streak_days, streak_days),
				streak_last_date = COALESCE(excluded.streak_last_date, streak_last_date)
		`)
		.bind(
			userId,
			data.display_name ?? null,
			data.home_locality ?? null,
			data.role ?? 'user',
			data.level ?? 1,
			data.streak_days ?? 0,
			data.streak_last_date ?? null
		)
		.run();
}

export async function updateProfileFields(
	db: D1Database,
	userId: string,
	fields: { display_name: string | null; bio: string | null; avatar_url: string | null }
): Promise<void> {
	await db
		.prepare('UPDATE profiles SET display_name = ?, bio = ?, avatar_url = ? WHERE id = ?')
		.bind(fields.display_name, fields.bio, fields.avatar_url, userId)
		.run();
}

export async function getUserSessions(db: D1Database, userId: string): Promise<Session[]> {
	const result = await db
		.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC')
		.bind(userId)
		.all<Session>();
	return result.results;
}

export async function getSessionById(db: D1Database, sessionId: string): Promise<Session | null> {
	return db
		.prepare('SELECT * FROM sessions WHERE id = ?')
		.bind(sessionId)
		.first<Session>();
}

export async function getSessionSightings(db: D1Database, sessionId: string): Promise<Sighting[]> {
	const result = await db
		.prepare('SELECT * FROM sightings WHERE session_id = ? ORDER BY tapped_at DESC')
		.bind(sessionId)
		.all<Sighting>();
	return result.results;
}

/**
 * Upserts a session row. Called repeatedly during a live observation (once at
 * start, then on every autosave) as well as once more at completion — so a
 * page reload or dropped connection mid-session never loses progress.
 *
 * `user_id` only ever moves from an anon owner to a real one, never back: if
 * the observer wasn't signed in yet when this session started, later
 * autosaves keep passing a fresh throwaway `anon:*` id (see
 * /api/sessions/autosave), which must not clobber the one already stored.
 */
export async function createSession(
	db: D1Database,
	session: Omit<Session, 'shared' | 'completed_at' | 'claim_email'>
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO sessions (id, user_id, space_id, space_name, spot_id, spot_name, locality, weather, condition, focal_area, lat, lng, duration_min, started_at, clock_offset_ms, total_count)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				user_id = CASE WHEN excluded.user_id NOT LIKE 'anon:%' THEN excluded.user_id ELSE sessions.user_id END,
				space_id = excluded.space_id,
				space_name = excluded.space_name,
				spot_id = excluded.spot_id,
				spot_name = excluded.spot_name,
				locality = excluded.locality,
				weather = excluded.weather,
				condition = excluded.condition,
				focal_area = excluded.focal_area,
				lat = excluded.lat,
				lng = excluded.lng,
				duration_min = excluded.duration_min,
				started_at = excluded.started_at,
				clock_offset_ms = excluded.clock_offset_ms,
				total_count = excluded.total_count
		`)
		.bind(
			session.id,
			session.user_id,
			session.space_id,
			session.space_name,
			session.spot_id,
			session.spot_name,
			session.locality,
			session.weather,
			session.condition,
			session.focal_area,
			session.lat,
			session.lng,
			session.duration_min,
			session.started_at,
			session.clock_offset_ms,
			session.total_count
		)
		.run();
}

export async function completeSession(
	db: D1Database,
	sessionId: string,
	totalCount: number
): Promise<void> {
	await db
		.prepare(`
			UPDATE sessions
			SET completed_at = datetime('now'), total_count = ?
			WHERE id = ?
		`)
		.bind(totalCount, sessionId)
		.run();
}

/** Stamps an as-yet-anonymous session with the email that wants to claim it. */
export async function setSessionClaimEmail(
	db: D1Database,
	sessionId: string,
	email: string
): Promise<void> {
	await db
		.prepare(`UPDATE sessions SET claim_email = ? WHERE id = ? AND user_id LIKE 'anon:%'`)
		.bind(email, sessionId)
		.run();
}

/**
 * Reassigns every anonymous session tagged with `email` to a real user id.
 * Called once a magic link is verified, so observations made before sign-in
 * land in the user's collection. Idempotent.
 */
export async function claimSessionsByEmail(
	db: D1Database,
	email: string,
	userId: string
): Promise<void> {
	await db
		.prepare(`UPDATE sessions SET user_id = ?, claim_email = NULL WHERE claim_email = ? AND user_id LIKE 'anon:%'`)
		.bind(userId, email)
		.run();
}

/**
 * Reassigns specific anon-owned sessions to a real user id, keyed by the
 * session ids a browser tracked locally (see $lib/localSessions). Lets a
 * device's past anonymous observations get linked the moment the observer
 * signs in normally, without requiring the email-claim flow. Idempotent.
 */
export async function claimSessionsByIds(
	db: D1Database,
	sessionIds: string[],
	userId: string
): Promise<void> {
	if (sessionIds.length === 0) return;
	const placeholders = sessionIds.map(() => '?').join(',');
	await db
		.prepare(`UPDATE sessions SET user_id = ?, claim_email = NULL WHERE id IN (${placeholders}) AND user_id LIKE 'anon:%'`)
		.bind(userId, ...sessionIds)
		.run();
}

/**
 * Records a single sighting — one row per button press, stamped with the
 * moment the button was actually pressed (not the session-complete time).
 */
export async function insertSighting(
	db: D1Database,
	sessionId: string,
	insectTypeId: number | null,
	insectName: string,
	tappedAt: string
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO sightings (session_id, insect_type_id, insect_name, count, tapped_at)
			VALUES (?, ?, ?, 1, ?)
		`)
		.bind(sessionId, insectTypeId, insectName, tappedAt)
		.run();
}

export async function getUserCollection(
	db: D1Database,
	userId: string
): Promise<Array<{ space_id: number; space_name: string; space_icon: string; space_slug: string; insect_name: string; icon: string; count: number }>> {
	const result = await db
		.prepare(`
			SELECT
				sp.id as space_id,
				sp.name as space_name,
				sp.icon as space_icon,
				sp.slug as space_slug,
				si.insect_name,
				it.icon,
				SUM(si.count) as count
			FROM sightings si
			JOIN sessions se ON si.session_id = se.id
			JOIN spaces sp ON se.space_id = sp.id
			JOIN insect_types it ON si.insect_type_id = it.id
			WHERE se.user_id = ?
			GROUP BY sp.id, si.insect_name
			ORDER BY sp.id, it.sort_order
		`)
		.bind(userId)
		.all<{ space_id: number; space_name: string; space_icon: string; space_slug: string; insect_name: string; icon: string; count: number }>();
	return result.results;
}

export async function createSpaceOrder(
	db: D1Database,
	orderId: string,
	userId: string
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO space_orders (id, user_id, stripe_status)
			VALUES (?, ?, 'pending')
		`)
		.bind(orderId, userId)
		.run();
}

export async function getSpaceOrder(db: D1Database, orderId: string): Promise<SpaceOrder | null> {
	return db
		.prepare('SELECT * FROM space_orders WHERE id = ?')
		.bind(orderId)
		.first<SpaceOrder>();
}

export async function updateSpaceOrderStatus(
	db: D1Database,
	orderId: string,
	status: 'pending' | 'paid' | 'failed'
): Promise<void> {
	await db
		.prepare('UPDATE space_orders SET stripe_status = ? WHERE id = ?')
		.bind(status, orderId)
		.run();
}

export async function updateSpaceOrderSpaceId(
	db: D1Database,
	orderId: string,
	spaceId: number
): Promise<void> {
	await db
		.prepare('UPDATE space_orders SET space_id = ? WHERE id = ?')
		.bind(spaceId, orderId)
		.run();
}

/** Redeem code plus per-row validity flags computed in SQL against datetime('now'). */
type RedeemCodeCheck = RedeemCode & { not_yet_valid: number; expired: number };

export async function getRedeemCode(db: D1Database, code: string): Promise<RedeemCodeCheck | null> {
	return db
		.prepare(`
			SELECT *,
				(datetime('now') < datetime(valid_from)) as not_yet_valid,
				(valid_until IS NOT NULL AND datetime('now') > datetime(valid_until)) as expired
			FROM redeem_codes
			WHERE UPPER(code) = UPPER(?)
		`)
		.bind(code.trim())
		.first<RedeemCodeCheck>();
}

export async function countRedeemCodeUses(db: D1Database, codeId: number): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) as count FROM redeem_code_uses WHERE code_id = ?')
		.bind(codeId)
		.first<{ count: number }>();
	return row?.count ?? 0;
}

export async function recordRedeemCodeUse(
	db: D1Database,
	codeId: number,
	userId: string,
	spaceOrderId: string | null
): Promise<void> {
	await db
		.prepare('INSERT INTO redeem_code_uses (code_id, user_id, space_order_id) VALUES (?, ?, ?)')
		.bind(codeId, userId, spaceOrderId)
		.run();
}

/**
 * Validates a redeem code for the given scope and user, recording the
 * redemption if it's valid. `scope` filters to codes issued for that entity
 * type ('any'-scoped codes always match).
 */
export async function redeemCode(
	db: D1Database,
	code: string,
	scope: Exclude<RedeemCodeScope, 'any'>,
	userId: string,
	spaceOrderId: string | null
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'inactive' | 'not_yet_valid' | 'expired' | 'max_uses' }> {
	const record = await getRedeemCode(db, code);
	if (!record || (record.scope !== scope && record.scope !== 'any')) return { ok: false, error: 'not_found' };
	if (!record.active) return { ok: false, error: 'inactive' };
	if (record.not_yet_valid) return { ok: false, error: 'not_yet_valid' };
	if (record.expired) return { ok: false, error: 'expired' };

	const uses = await countRedeemCodeUses(db, record.id);
	if (uses >= record.max_uses) return { ok: false, error: 'max_uses' };

	await recordRedeemCodeUse(db, record.id, userId, spaceOrderId);
	return { ok: true };
}

export async function createSpace(
	db: D1Database,
	space: Pick<Space, 'slug' | 'name' | 'locality' | 'country' | 'icon' | 'lat' | 'lng' | 'owner_id'> & {
		boundary_geojson?: string | null;
	}
): Promise<number> {
	const result = await db
		.prepare(`
			INSERT INTO spaces (slug, name, locality, country, icon, lat, lng, owner_id, boundary_geojson)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			space.slug,
			space.name,
			space.locality,
			space.country,
			space.icon,
			space.lat,
			space.lng,
			space.owner_id,
			space.boundary_geojson ?? null
		)
		.run() as { success: boolean; meta: { last_row_id: number } };
	return result.meta.last_row_id;
}

export async function updateSpaceFields(
	db: D1Database,
	spaceId: number,
	fields: {
		name: string;
		locality: string | null;
		country: string | null;
		lat: number | null;
		lng: number | null;
		boundary_geojson?: string | null;
	}
): Promise<void> {
	await db
		.prepare('UPDATE spaces SET name = ?, locality = ?, country = ?, lat = ?, lng = ?, boundary_geojson = ? WHERE id = ?')
		.bind(fields.name, fields.locality, fields.country, fields.lat, fields.lng, fields.boundary_geojson ?? null, spaceId)
		.run();
}

export async function getSpaceSessions(db: D1Database, spaceId: number): Promise<Session[]> {
	const result = await db
		.prepare('SELECT * FROM sessions WHERE space_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC')
		.bind(spaceId)
		.all<Session>();
	return result.results;
}

export async function getSpaceLiveData(
	db: D1Database,
	spaceId: number
): Promise<{ totalThisWeek: number; lastInsect: string | null; lastSeenAt: string | null }> {
	const totalRow = await db
		.prepare(`
			SELECT COALESCE(SUM(s.total_count), 0) as total
			FROM sessions s
			WHERE s.space_id = ? AND s.completed_at >= datetime('now', '-7 days')
		`)
		.bind(spaceId)
		.first<{ total: number }>();

	const lastRow = await db
		.prepare(`
			SELECT si.insect_name, si.tapped_at
			FROM sightings si
			JOIN sessions se ON si.session_id = se.id
			WHERE se.space_id = ?
			ORDER BY si.tapped_at DESC
			LIMIT 1
		`)
		.bind(spaceId)
		.first<{ insect_name: string; tapped_at: string }>();

	return {
		totalThisWeek: totalRow?.total ?? 0,
		lastInsect: lastRow?.insect_name ?? null,
		lastSeenAt: lastRow?.tapped_at ?? null
	};
}

export async function createMedia(
	db: D1Database,
	media: Pick<
		Media,
		| 'id'
		| 'entity_type'
		| 'entity_id'
		| 'media_type'
		| 'r2_key'
		| 'mime_type'
		| 'bytes'
		| 'width'
		| 'height'
		| 'label'
		| 'notes'
		| 'attribution'
		| 'alt_text'
		| 'uploaded_by'
	>
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO media (id, entity_type, entity_id, media_type, r2_key, mime_type, bytes, width, height, label, notes, attribution, alt_text, uploaded_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			media.id,
			media.entity_type,
			media.entity_id,
			media.media_type,
			media.r2_key,
			media.mime_type,
			media.bytes,
			media.width,
			media.height,
			media.label,
			media.notes,
			media.attribution,
			media.alt_text,
			media.uploaded_by
		)
		.run();
}

export async function getMediaById(db: D1Database, id: string): Promise<Media | null> {
	return db.prepare('SELECT * FROM media WHERE id = ?').bind(id).first<Media>();
}

export async function getMediaForEntity(
	db: D1Database,
	entityType: MediaEntityType,
	entityId: string
): Promise<Media[]> {
	const result = await db
		.prepare('SELECT * FROM media WHERE entity_type = ? AND entity_id = ? ORDER BY sort_order ASC, created_at ASC')
		.bind(entityType, entityId)
		.all<Media>();
	return result.results;
}

/** The most recent prior observation's photo at a spot, if any — for the "what changed" read. */
export async function getPreviousObservationPhoto(
	db: D1Database,
	spotId: number,
	excludeSessionId: string
): Promise<Media | null> {
	return db
		.prepare(`
			SELECT m.* FROM sessions s
			JOIN media m ON m.entity_type = 'session' AND m.entity_id = s.id
			WHERE s.spot_id = ? AND s.id != ?
			ORDER BY s.started_at DESC
			LIMIT 1
		`)
		.bind(spotId, excludeSessionId)
		.first<Media>();
}

export async function deleteMedia(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
}

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
