import type { Space, Session } from '$lib/types';
import type { D1Database } from './d1';

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

export async function createSpace(
	db: D1Database,
	space: Pick<Space, 'slug' | 'name' | 'locality' | 'country' | 'icon' | 'lat' | 'lng' | 'owner_id'> & {
		description?: string | null;
		town?: string | null;
		region?: string | null;
		postcode?: string | null;
		country_geoname_id?: number | null;
		region_geoname_id?: number | null;
		town_geoname_id?: number | null;
		locality_geoname_id?: number | null;
		boundary_geojson?: string | null;
	}
): Promise<number> {
	const result = await db
		.prepare(`
			INSERT INTO spaces (
				slug, name, description, locality, country, town, region, postcode,
				country_geoname_id, region_geoname_id, town_geoname_id, locality_geoname_id,
				icon, lat, lng, owner_id, boundary_geojson
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			space.slug,
			space.name,
			space.description ?? null,
			space.locality,
			space.country,
			space.town ?? null,
			space.region ?? null,
			space.postcode ?? null,
			space.country_geoname_id ?? null,
			space.region_geoname_id ?? null,
			space.town_geoname_id ?? null,
			space.locality_geoname_id ?? null,
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
		town?: string | null;
		region?: string | null;
		postcode?: string | null;
		country_geoname_id?: number | null;
		region_geoname_id?: number | null;
		town_geoname_id?: number | null;
		locality_geoname_id?: number | null;
		lat: number | null;
		lng: number | null;
		boundary_geojson?: string | null;
	}
): Promise<void> {
	await db
		.prepare(
			`UPDATE spaces SET
				name = ?, locality = ?, country = ?, town = ?, region = ?, postcode = ?,
				country_geoname_id = ?, region_geoname_id = ?, town_geoname_id = ?, locality_geoname_id = ?,
				lat = ?, lng = ?, boundary_geojson = ?
			WHERE id = ?`
		)
		.bind(
			fields.name,
			fields.locality,
			fields.country,
			fields.town ?? null,
			fields.region ?? null,
			fields.postcode ?? null,
			fields.country_geoname_id ?? null,
			fields.region_geoname_id ?? null,
			fields.town_geoname_id ?? null,
			fields.locality_geoname_id ?? null,
			fields.lat,
			fields.lng,
			fields.boundary_geojson ?? null,
			spaceId
		)
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
