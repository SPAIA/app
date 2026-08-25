export interface InsectType {
	id: number;
	name: string;
	icon: string;
	sort_order: number;
	active: number;
}

/** An area like a public park — may contain many monitoring spots. */
export interface Space {
	id: number;
	slug: string;
	name: string;
	locality: string;
	country: string | null;
	icon: string;
	lat: number | null;
	lng: number | null;
	/** GeoJSON Polygon/MultiPolygon outlining the space, if one's been drawn. */
	boundary_geojson: string | null;
	owner_id: string | null;
	active: number;
	created_at: string;
}

/** A point of interest within a space, e.g. a patch of flowers someone returns to. */
export interface Spot {
	id: number;
	space_id: number;
	slug: string;
	name: string;
	icon: string;
	lat: number | null;
	lng: number | null;
	active: number;
	created_at: string;
	/** JSON string: {name, scene, plants, habitat_features, changes} — a cached copy of the latest DeepSeek Vision read, for cheap display. The plants/habitat_features tables are the durable, queryable record. */
	ai_description: string | null;
	/** Set when the spot was bought/redeemed rather than added for free during a session. */
	owner_id: string | null;
	/** The space_orders row that paid for this spot, if any — prevents one order minting two spots. */
	order_id: string | null;
}

/** Taxonomic rank; "type" is not a real rank — it's a generic guess not yet pinned to one. */
export type PlantRank = 'family' | 'genus' | 'species' | 'type';

export type PlantNameType = 'scientific' | 'common';

export type HabitatFeatureCategory =
	| 'groundcover'
	| 'soil'
	| 'rock_feature'
	| 'woody_debris'
	| 'water'
	| 'nesting_feature'
	| 'vegetation_structure'
	| 'other';

export type PlantObservationSource = 'deepseek_vision' | 'plantnet' | 'manual';

/** A taxonomic entity — family, genus, or species — or a generic bucket ("shrub") not yet identified that precisely. */
export interface Plant {
	id: number;
	rank: PlantRank;
	/** GBIF backbone taxon key, once matched — the id Pl@ntNet results will carry. */
	gbif_id: number | null;
	parent_id: number | null;
	created_at: string;
}

/** One name a plant is known by, in one language. */
export interface PlantName {
	id: number;
	plant_id: number;
	/** ISO 639-1, e.g. "en", "de"; "la" for scientific/Latin. */
	language: string;
	name_type: PlantNameType;
	name: string;
	is_preferred: number;
	source: string | null;
	created_at: string;
}

/** A habitat feature read off a spot's photo — a boulder, a puddle, leaf litter, and so on. */
export interface HabitatFeature {
	id: number;
	spot_id: number;
	media_id: string;
	category: HabitatFeatureCategory;
	label: string;
	source: string;
	created_at: string;
}

/** Links a spot's photo to a plant identified in it — the spot<->plant join, and the future Pl@ntNet cache. */
export interface PlantObservation {
	id: number;
	spot_id: number;
	media_id: string;
	plant_id: number;
	confidence: number | null;
	source: PlantObservationSource;
	raw_response: string | null;
	created_at: string;
}

/** What DeepSeek Vision is asked to return for a spot's photo. */
export interface SpotVisionResult {
	name: string;
	scene: string;
	plants: { name: string; rank: PlantRank }[];
	habitat_features: { category: HabitatFeatureCategory; label: string }[];
	/** Set only when a previous visit's photo was sent alongside this one. */
	changes: string | null;
	/** Best guess at current weather, read off the photo — null if it can't be told. */
	weather: 'sunny' | 'partly' | 'overcast' | 'rainy' | null;
}

export interface Profile {
	id: string;
	display_name: string | null;
	home_locality: string | null;
	role: 'user' | 'admin';
	level: number;
	streak_days: number;
	streak_last_date: string | null;
	bio: string | null;
	avatar_url: string | null;
	created_at: string;
}

export interface Session {
	id: string;
	user_id: string;
	space_id: number | null;
	space_name: string | null;
	spot_id: number | null;
	spot_name: string | null;
	locality: string | null;
	weather: 'sunny' | 'partly' | 'overcast' | 'rainy' | null;
	/** Free-text habitat condition, taken only when the observer skipped the observation photo. */
	condition: string | null;
	focal_area: string | null;
	lat: number | null;
	lng: number | null;
	duration_min: number;
	started_at: string | null;
	completed_at: string | null;
	/** Offset (server − device, ms) the phone applied to align timestamps to server/UTC time. */
	clock_offset_ms: number | null;
	total_count: number;
	shared: number;
	claim_email: string | null;
}

export interface Sighting {
	id: number;
	session_id: string;
	insect_type_id: number | null;
	insect_name: string;
	count: number;
	tapped_at: string;
}

export interface SpaceOrder {
	id: string;
	user_id: string;
	space_name: string | null;
	locality: string | null;
	stripe_status: 'pending' | 'paid' | 'failed';
	space_id: number | null;
	created_at: string;
}

export type RedeemCodeScope = 'space' | 'spot' | 'any';

/** A promo/partner code that unlocks free space or spot creation. */
export interface RedeemCode {
	id: number;
	code: string;
	scope: RedeemCodeScope;
	max_uses: number;
	valid_from: string;
	valid_until: string | null;
	active: number;
	note: string | null;
	created_by: string | null;
	created_at: string;
}

/** A single redemption of a code, used to enforce max_uses and one-use-per-user. */
export interface RedeemCodeUse {
	id: number;
	code_id: number;
	user_id: string;
	space_order_id: string | null;
	used_at: string;
}

export interface LeaderboardRow {
	locality: string;
	total_sightings: number;
	observer_count: number;
}

export interface LiveSpaceData {
	spaceName: string;
	totalThisWeek: number;
	lastInsect: string | null;
	lastSeenAt: string | null;
}

export type MediaEntityType = 'space' | 'spot' | 'profile' | 'session' | 'sighting';
export type MediaType = 'header_image' | 'gallery' | 'thumbnail' | 'avatar';

/** A photo (or other file) attached to one of several entity types. */
export interface Media {
	id: string;
	entity_type: MediaEntityType;
	entity_id: string;
	media_type: MediaType;
	r2_key: string;
	mime_type: string;
	bytes: number;
	width: number | null;
	height: number | null;
	label: string | null;
	notes: string | null;
	attribution: string | null;
	alt_text: string | null;
	sort_order: number;
	uploaded_by: string | null;
	created_at: string;
}
