/** Lowercases, collapses whitespace, and drops a leading article — the trivial phrasing variance an LLM introduces run to run. */
export function normalizePlantName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/^(a|an|the)\s+/, '');
}

/** Dice coefficient over character bigrams — cheap, dependency-free similarity for short phrases. */
export function bigramSimilarity(a: string, b: string): number {
	if (a === b) return 1;

	const bigramsOf = (s: string) => {
		const counts = new Map<string, number>();
		for (let i = 0; i < s.length - 1; i++) {
			const bg = s.slice(i, i + 2);
			counts.set(bg, (counts.get(bg) ?? 0) + 1);
		}
		return counts;
	};

	const a2 = bigramsOf(a);
	const b2 = bigramsOf(b);
	if (a2.size === 0 || b2.size === 0) return 0;

	let overlap = 0;
	for (const [bg, count] of a2) {
		const other = b2.get(bg);
		if (other) overlap += Math.min(count, other);
	}

	const total = [...a2.values()].reduce((s, n) => s + n, 0) + [...b2.values()].reduce((s, n) => s + n, 0);
	return (2 * overlap) / total;
}

/** True if the shorter string sits fully inside the longer one — catches "oak" vs "oak tree" without a bigram score. */
function isContained(a: string, b: string): boolean {
	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
	return shorter.length >= 3 && longer.includes(shorter);
}

/** Best match for `name` (already normalized) among `candidates`, or null if nothing clears `threshold`. */
export function findBestNameMatch<T extends { name: string }>(name: string, candidates: T[], threshold = 0.5): T | null {
	let best: T | null = null;
	let bestScore = 0;

	for (const candidate of candidates) {
		const candidateName = normalizePlantName(candidate.name);
		const score = isContained(name, candidateName) ? 1 : bigramSimilarity(name, candidateName);
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}

	return bestScore >= threshold ? best : null;
}
