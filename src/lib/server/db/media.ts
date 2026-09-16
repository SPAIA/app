import type { Media, MediaEntityType } from '$lib/types';
import type { D1Database } from './d1';

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
