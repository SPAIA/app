function escapeCsvValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (/[",\r\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** Converts row objects to a CSV string, using the keys of the first row as the header. */
export function toCsv(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) return '';
	const columns = Object.keys(rows[0]);
	const lines = [columns.join(',')];
	for (const row of rows) {
		lines.push(columns.map((col) => escapeCsvValue(row[col])).join(','));
	}
	return lines.join('\r\n');
}
