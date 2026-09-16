import { writable } from 'svelte/store';
import type { SpotVisionResult, WeatherObservation } from '$lib/types';

export type WeatherOption = 'sunny' | 'partly' | 'overcast' | 'rainy';
/** Paired with the automatic DWD wind_speed_kmh reading — neither overwrites the other. */
export type WindOption = 'still' | 'light_breeze' | 'leaves_moving' | 'branches_moving';
export type SessionStep = 'setup' | 'observe' | 'thankyou' | 'cards' | 'summary';
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
	spotId: number | null;
	spotName: string | null;
	/** Neighbourhood/locality reverse-geocoded from the session GPS fix. */
	locality: string | null;
	weather: WeatherOption | null;
	/** The Bright Sky reading `weather` was derived from — set in the background once geolocation resolves, see SetupStep. */
	weatherObservationId: number | null;
	/** The full reading, kept only for display (temperature, source, station) — the server already has it via weatherObservationId. */
	weatherObservation: WeatherObservation | null;
	/** True when the linked weather observation reads as windy — a derived fact, not something the observer sets. */
	windy: boolean;
	/** Free-text habitat condition, taken only when the observer skipped the observation photo. */
	condition: string | null;
	/** Anything else worth remembering that isn't a tappable insect — mice, snails, tracks. */
	notes: string;
	/** Manual 4-step wind read, paired with the automatic windy flag above — neither overwrites the other. */
	windObserved: WindOption | null;
	/** Incidental wildlife spotted that isn't a tappable insect type — mice, snails, and so on. */
	otherCreatures: { creature: string; label: string | null }[];
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
	spotId: null,
	spotName: null,
	locality: null,
	weather: null,
	weatherObservationId: null,
	weatherObservation: null,
	windy: false,
	condition: null,
	notes: '',
	windObserved: null,
	otherCreatures: [],
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
