export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	/** Runs every statement as one atomic transaction, in order. */
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ success: boolean; meta: unknown; results: T[] }[]>;
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(column?: string): Promise<T | null>;
	all<T = unknown>(): Promise<{ results: T[] }>;
	run(): Promise<{ success: boolean; meta: unknown }>;
}
