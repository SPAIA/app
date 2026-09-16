import type { Profile } from '$lib/types';
import type { D1Database } from './d1';

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
