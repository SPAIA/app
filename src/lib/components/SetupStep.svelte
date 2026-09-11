<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { sessionStore } from '$lib/stores/session';
	import type { Spot, SpotVisionResult } from '$lib/types';
	import { syncClock, clockOffsetMs, nowISO, timeOfDayLabel } from '$lib/time';
	import { resizeImageFile } from '$lib/media/resizeImage';
	import { haversineKm, directionsUrl, formatDistanceRange } from '$lib/geo';
	import { trackLocalSessionId } from '$lib/localSessions';
	import { resetSaveProgress } from '$lib/sessionSave';

	export let spot: Spot & { locality: string };
	export let cover: { id: string } | null = null;

	// If you're far from the spot we just warn — doesn't block observing.
	const PROXIMITY_THRESHOLD_KM = 0.1;

	type Phase = 'overview' | 'locating' | 'gpsError' | 'photo';
	let phase: Phase = 'overview';
	let showFarWarning = false;
	let showFarModal = false;

	/** Default observation length — the duration picker was removed to get straight to counting. */
	const DEFAULT_DURATION_MIN = 5;

	let lat: number | null = null;
	let lng: number | null = null;
	let distanceKm: number | null = null;
	let accuracy: number | null = null;

	let sessionId: string | null = null;
	let spotName = spot.name;
	let fileInput: HTMLInputElement;
	let preparingPhoto = false;

	function checkProximity() {
		phase = 'locating';

		if (!navigator.geolocation) {
			phase = 'gpsError';
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(pos) => {
				lat = pos.coords.latitude;
				lng = pos.coords.longitude;
				accuracy = pos.coords.accuracy;

				if (spot.lat != null && spot.lng != null) {
					distanceKm = haversineKm(lat, lng, spot.lat, spot.lng);
					showFarWarning = distanceKm > PROXIMITY_THRESHOLD_KM;
				}

				sessionId = crypto.randomUUID();
				trackLocalSessionId(sessionId);
				phase = 'photo';
			},
			() => {
				phase = 'gpsError';
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	function openFilePicker() {
		fileInput?.click();
	}

	// The photo upload + DeepSeek Vision read run in the background from here on — the
	// observer moves straight into the timer/count instead of waiting on them. Results
	// land in sessionStore and are shown for confirmation after the count (see
	// SpotConfirmStep), whenever the fetch below happens to resolve.
	async function onFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || sessionId == null) return;

		preparingPhoto = true;
		const resized = await resizeImageFile(file);
		void uploadPhoto(resized);
		preparingPhoto = false;
		input.value = '';
		handleBegin();
	}

	async function uploadPhoto(file: File) {
		if (sessionId == null) return;
		sessionStore.update((s) => ({ ...s, visionStatus: 'pending' }));

		try {
			const form = new FormData();
			form.append('file', file);
			form.append('spot_id', String(spot.id));
			form.append('locality', spot.locality);
			form.append('time_of_day', timeOfDayLabel());

			const res = await fetch(`/api/sessions/${sessionId}/photo`, { method: 'POST', body: form });
			if (!res.ok) throw new Error('upload failed');
			const data = (await res.json()) as {
				media: { id: string; url: string };
				spot: { name: string };
				vision: SpotVisionResult | null;
				isNewSpot: boolean;
			};
			sessionStore.update((s) => ({
				...s,
				photoUrl: data.media.url,
				mediaId: data.media.id,
				vision: data.vision,
				isNewSpot: data.isNewSpot,
				visionStatus: data.vision ? 'done' : 'error',
				focalArea: data.vision?.scene || s.focalArea
			}));
		} catch (err) {
			console.error('Spot photo upload failed', err);
			sessionStore.update((s) => ({ ...s, visionStatus: 'error' }));
		}
	}

	function skipPhoto() {
		handleBegin();
	}

	function handleBegin() {
		if (showFarWarning) {
			showFarModal = true;
			return;
		}
		beginSession();
	}

	function beginSession() {
		showFarModal = false;
		resetSaveProgress();
		sessionStore.update((s) => ({
			...s,
			sessionId,
			counts: {},
			taps: [],
			totalCount: 0,
			spaceId: spot.space_id,
			spaceName: null,
			spotId: spot.id,
			spotName,
			locality: spot.locality,
			// Weather and habitat condition are captured after the count, in SpotConfirmStep.
			// If the background vision read already landed, keep its scene; otherwise fall
			// back to the spot name for now — uploadPhoto backfills this once it resolves.
			focalArea: s.focalArea || spotName,
			lat,
			lng,
			durationMin: DEFAULT_DURATION_MIN,
			totalDurationMin: DEFAULT_DURATION_MIN,
			clockOffsetMs: clockOffsetMs(),
			startedAt: nowISO(),
			step: 'observe'
		}));
	}

	onMount(() => {
		// Align the device clock to server (UTC) time early, so taps recorded
		// during the session line up with the NTP-synced site camera.
		void syncClock();
	});
</script>

{#if showFarModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
		<div class="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-base-100 p-5 text-center shadow-xl">
			<span class="text-3xl">📍</span>
			<p class="text-sm text-base-content">
				{$_('observe.setup.proximity.farWarning', {
					values: { distance: distanceKm != null ? formatDistanceRange(distanceKm, accuracy) : '?' }
				})}
			</p>
			{#if spot.lat != null && spot.lng != null}
				<a
					class="btn btn-outline w-full"
					href={directionsUrl(spot.lat, spot.lng)}
					target="_blank"
					rel="noopener noreferrer"
				>
					{$_('observe.setup.proximity.directions')}
				</a>
			{/if}
			<button class="btn btn-primary w-full" onclick={beginSession}>
				{$_('observe.setup.proximity.continueAnyway')}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={() => (showFarModal = false)}>
				{$_('observe.setup.proximity.cancel')}
			</button>
		</div>
	</div>
{/if}

{#if phase === 'overview'}
	<div class="flex flex-col">
		{#if cover}
			<img src="/api/media/{cover.id}" alt="" class="h-56 w-full object-cover" />
		{/if}
		<div class="flex flex-col items-center gap-3 px-5 pb-8 pt-6 text-center">
			<span class="text-3xl">{spot.icon}</span>
			<div>
				<h1 class="text-xl font-medium text-base-content">{spot.name}</h1>
				<p class="text-sm text-base-content/50">{spot.locality}</p>
			</div>
			<button class="btn btn-primary btn-lg mt-2 w-full" onclick={checkProximity}>
				{$_('observe.overview.cta')}
			</button>
			<a class="btn btn-ghost btn-sm w-full" href="/tutorial">
				{$_('observe.overview.tutorial')}
			</a>
		</div>
	</div>
{:else if phase === 'locating' || phase === 'gpsError'}
	<div class="flex flex-col items-center gap-4 px-5 py-10 text-center">
		<span class="text-3xl">{spot.icon}</span>
		<h1 class="text-lg font-medium text-base-content">{spot.name}</h1>

		{#if phase === 'locating'}
			<span class="loading loading-spinner loading-lg text-primary"></span>
			<p class="text-sm text-base-content/50">{$_('observe.setup.proximity.checking')}</p>
		{:else if phase === 'gpsError'}
			<p class="text-sm text-error">{$_('observe.setup.proximity.error')}</p>
			<button class="btn btn-primary w-full" onclick={checkProximity}>
				{$_('observe.setup.proximity.retry')}
			</button>
		{/if}
	</div>
{:else if phase === 'photo'}
	<div class="flex flex-col items-center gap-4 px-5 py-10 text-center">
		<span class="text-4xl">📷</span>
		<div>
			<p class="text-base font-medium text-base-content">{$_('observe.setup.photo.label')}</p>
			<p class="mt-1 text-sm text-base-content/50">{$_('observe.setup.photo.hint')}</p>
		</div>

		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			capture="environment"
			class="sr-only"
			onchange={onFileSelected}
		/>

		<button class="btn btn-primary w-full" onclick={openFilePicker} disabled={preparingPhoto}>
			{$_('spot.add.photo.cta')}
		</button>
		<button class="btn btn-ghost btn-sm" onclick={skipPhoto}>
			{$_('observe.setup.photo.skip')}
		</button>
	</div>
{/if}
