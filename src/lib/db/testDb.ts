import Database from 'better-sqlite3';
import type { D1Database, D1PreparedStatement } from '$lib/server/db/d1';

/**
 * A real-SQLite-backed D1Database for tests — exercises the actual SQL
 * (upserts, unique constraints, batch/transaction) rather than a mocked
 * query layer, so idempotency behavior is verified against real semantics.
 */
class D1StatementShim implements D1PreparedStatement {
	constructor(
		readonly stmt: Database.Statement,
		readonly params: unknown[] = []
	) {}

	bind(...values: unknown[]): D1PreparedStatement {
		return new D1StatementShim(this.stmt, values);
	}

	async first<T = unknown>(column?: string): Promise<T | null> {
		const row = this.stmt.get(...this.params) as Record<string, unknown> | undefined;
		if (row === undefined) return null;
		return (column ? (row[column] ?? null) : row) as T;
	}

	async all<T = unknown>(): Promise<{ results: T[] }> {
		return { results: this.stmt.all(...this.params) as T[] };
	}

	async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
		const info = this.stmt.run(...this.params);
		return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
	}
}

export class TestD1Database implements D1Database {
	constructor(readonly raw: Database.Database) {}

	prepare(query: string): D1PreparedStatement {
		return new D1StatementShim(this.raw.prepare(query));
	}

	async batch<T = unknown>(
		statements: D1PreparedStatement[]
	): Promise<{ success: boolean; meta: unknown; results: T[] }[]> {
		const shims = statements as D1StatementShim[];
		const txn = this.raw.transaction((stmts: D1StatementShim[]) =>
			stmts.map((s) => {
				const info = s.stmt.run(...s.params);
				return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) }, results: [] as T[] };
			})
		);
		return txn(shims);
	}
}

/** Schema mirroring the current production shape for the tables the observation-sync path touches. */
const SCHEMA = `
CREATE TABLE sessions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	space_id INTEGER,
	spot_id INTEGER,
	locality TEXT,
	weather TEXT,
	weather_observation_id INTEGER,
	condition TEXT,
	notes TEXT,
	wind_observed TEXT,
	focal_area TEXT,
	lat REAL,
	lng REAL,
	duration_min INTEGER,
	started_at TEXT,
	completed_at TEXT,
	clock_offset_ms INTEGER,
	total_count INTEGER DEFAULT 0,
	shared INTEGER DEFAULT 0,
	claim_email TEXT
);

CREATE TABLE sightings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL,
	insect_type_id INTEGER,
	insect_name TEXT NOT NULL,
	count INTEGER DEFAULT 1,
	tapped_at TEXT,
	tap_id TEXT
);
CREATE UNIQUE INDEX idx_sightings_tap_id ON sightings(session_id, tap_id);

CREATE TABLE session_creatures (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL,
	creature TEXT NOT NULL,
	label TEXT,
	created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE spot_insect_stats (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	spot_id INTEGER NOT NULL,
	insect_type_id INTEGER,
	insect_name TEXT NOT NULL,
	total_count INTEGER NOT NULL DEFAULT 0,
	UNIQUE(spot_id, insect_name)
);

CREATE TABLE spots (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	space_id INTEGER,
	slug TEXT,
	name TEXT,
	icon TEXT,
	lat REAL,
	lng REAL,
	active INTEGER DEFAULT 1,
	created_at TEXT DEFAULT (datetime('now')),
	ai_description TEXT,
	owner_id TEXT,
	order_id TEXT,
	total_minutes_observed INTEGER DEFAULT 0
);

CREATE TABLE insect_types (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT,
	icon TEXT,
	sort_order INTEGER,
	active INTEGER DEFAULT 1
);

CREATE TABLE profiles (
	id TEXT PRIMARY KEY,
	display_name TEXT,
	home_locality TEXT,
	role TEXT DEFAULT 'user',
	level INTEGER DEFAULT 1,
	streak_days INTEGER DEFAULT 0,
	streak_last_date TEXT,
	bio TEXT,
	avatar_url TEXT,
	created_at TEXT DEFAULT (datetime('now'))
);
`;

export function createTestDb(): TestD1Database {
	const raw = new Database(':memory:');
	raw.exec(SCHEMA);
	return new TestD1Database(raw);
}
