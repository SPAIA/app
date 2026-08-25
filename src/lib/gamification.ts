export const LEVEL_TITLE_KEYS = [
	'level.1',
	'level.2',
	'level.3',
	'level.4',
	'level.5',
	'level.6',
	'level.7'
];

export function updateStreak(streakDays: number, streakLastDate: string | null): {
	newStreak: number;
	newLastDate: string;
} {
	const today = new Date().toISOString().split('T')[0];

	if (!streakLastDate) {
		return { newStreak: 1, newLastDate: today };
	}

	const last = new Date(streakLastDate);
	const now = new Date(today);
	const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

	if (diffDays === 0) {
		// Already observed today
		return { newStreak: streakDays, newLastDate: streakLastDate };
	} else if (diffDays === 1) {
		// Consecutive day
		return { newStreak: streakDays + 1, newLastDate: today };
	} else {
		// Streak broken
		return { newStreak: 1, newLastDate: today };
	}
}
