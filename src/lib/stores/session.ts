import { writable } from 'svelte/store';
import type { SpotVisionResult } from '$lib/types';

export type WeatherOption = 'sunny' | 'partly' | 'overcast' | 'rainy';
export type SessionStep = 'setup' | 'observe' | 'thankyou' | 'confirm' | 'cards' | 'summary';
/** DeepSeek Vision runs in the background right after the spot photo is taken — see SetupStep. */
export type VisionStatus = 'none' | 'pending' | 'done' | 'error';

/** A single button press, recorded at the moment it happens. */
export interface Tap {
	name: string;
	tappedAt: string; // ISO timestamp of the actual press
}

export interface SessionState {
	/** Set once the session is persisted server-side (on completion). */
	sessionId: string | null;
	spaceId: number | null;
	spaceName: string | null;
	spotId: number | null;
	spotName: string | null;
	/** Neighbourhood/locality reverse-geocoded from the session GPS fix. */
	locality: string | null;
	weather: WeatherOption | null;
	/** Free-text habitat condition, taken only when the observer skipped the observation photo. */
	condition: string | null;
	/** Short scene description — from the spot's DeepSeek Vision read, or typed by hand if AI is unavailable. */
	focalArea: string;
	/** Set once the spot photo upload resolves, so the vision result can be shown after the count. */
	photoUrl: string | null;
	mediaId: string | null;
	vision: SpotVisionResult | null;
	visionStatus: VisionStatus;
	/** Whether this spot had never been photographed before this session — drives the name-confirm UI. */
	isNewSpot: boolean;
	lat: number | null;
	lng: number | null;
	/** Countdown length of the current timer leg (the "add time" flow starts a new leg with just the extra minutes). */
	durationMin: number;
	/** Sum of every leg's duration — what gets recorded as the session's real length. */
	totalDurationMin: number;
	startedAt: string | null;
	/** Offset (server − device, ms) applied to startedAt/taps; records how far the device clock was corrected. */
	clockOffsetMs: number;
	/** Per-type running totals, used only for live UI badges. */
	counts: Record<string, number>;
	/** Authoritative record: one entry per button press, with its own timestamp. */
	taps: Tap[];
	totalCount: number;
	step: SessionStep;
}

const initialState: SessionState = {
	sessionId: null,
	spaceId: null,
	spaceName: null,
	spotId: null,
	spotName: null,
	locality: null,
	weather: null,
	condition: null,
	focalArea: '',
	photoUrl: null,
	mediaId: null,
	vision: null,
	visionStatus: 'none',
	isNewSpot: false,
	lat: null,
	lng: null,
	durationMin: 10,
	totalDurationMin: 10,
	startedAt: null,
	clockOffsetMs: 0,
	counts: {},
	taps: [],
	totalCount: 0,
	step: 'setup'
};

export const sessionStore = writable<SessionState>({ ...initialState });

export function resetSession() {
	sessionStore.set({ ...initialState });
}
