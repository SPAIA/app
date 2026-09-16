<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { sessionStore } from '$lib/stores/session';
	import type { Spot, SpotVisionResult, WeatherObservation } from '$lib/types';
	import { syncClock, clockOffsetMs, nowISO, timeOfDayLabel } from '$lib/time';
	import { resizeImageFile } from '$lib/media/resizeImage';
	import { haversineKm, directionsUrl, formatDistanceRange } from '$lib/geo';
	import { trackLocalSessionId } from '$lib/localSessions';
	import { persistLocal, resetSyncProgress, syncNow } from '$lib/session/sync';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	export let spot: Spot & { locality: string };
	export let cover: { id: string } | null = null;

	// If you're far from the spot we just warn — doesn't block observing.
	const PROXIMITY_THRESHOLD_KM = 0.1;

	type Phase = 'overview' | 'locating' | 'photo';
	let phase: Phase = 'overview';
	let showFarWarning = false;
	let showFarModal = false;

	/** Default observation length — the duration picker was removed to get straight to counting. */
	const DEFAULT_DURATION_MIN = 5;

	/** Don't make the observer wait indefinitely for a GPS fix — fall back to the spot's own coordinates. */
	const GPS_TIMEOUT_MS = 6000;

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
		let settled = false;

		// Whichever settles first wins — a slow/denied/never-arriving GPS fix
		// must not leave the observer stuck on a spinner. Falls back to the
		// spot's own saved coordinates instead of blocking.
		function finish(pos: GeolocationPosition | null) {
			if (settled) return;
			settled = true;

			if (pos) {
				lat = pos.coords.latitude;
				lng = pos.coords.longitude;
				accuracy = pos.coords.accuracy;
			} else {
				lat = spot.lat ?? null;
				lng = spot.lng ?? null;
				accuracy = null;
			}

			if (pos && spot.lat != null && spot.lng != null && lat != null && lng != null) {
				distanceKm = haversineKm(lat, lng, spot.lat, spot.lng);
				showFarWarning = distanceKm > PROXIMITY_THRESHOLD_KM;
			}

			startProvisionalSession();
			if (lat != null && lng != null) void fetchWeather(lat, lng);
			phase = 'photo';
		}

		if (!navigator.geolocation) {
			finish(null);
			return;
		}

		const timer = setTimeout(() => finish(null), GPS_TIMEOUT_MS);
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				clearTimeout(timer);
				finish(pos);
			},
			() => {
				clearTimeout(timer);
				finish(null);
			},
			{ enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS }
		);
	}

	// Mints the session id and creates its server-side row right away — before
	// the photo even uploads — so a crash, kill, or lost connection between
	// here and the observer's first tap never leaves an orphaned photo with no
	// session behind it (see /api/sessions/[id]/photo, which uploads under this
	// id immediately after).
	function startProvisionalSession() {
		sessionId = crypto.randomUUID();
		trackLocalSessionId(sessionId);
		sessionStore.update((s) => ({
			...s,
			sessionId,
			spaceId: spot.space_id,
			spotId: spot.id,
			spotName,
			locality: spot.locality,
			lat,
			lng,
			startedAt: nowISO(),
			clockOffsetMs: clockOffsetMs(),
			durationMin: DEFAULT_DURATION_MIN,
			totalDurationMin: DEFAULT_DURATION_MIN
		}));
		resetSyncProgress();
		persistLocal();
		void syncNow();
	}

	function openFilePicker() {
		fileInput?.click();
	}

	// Kicked off as soon as GPS resolves (well before the observer reaches
	// the post-count screen) so the real weather reading (Bright Sky or Visual
	// Crossing, see $lib/server/weather) is already in the store by the time
	// it's needed — no photo required, unlike the old DeepSeek weather guess.
	// Best-effort: a failed fetch just leaves the weather chips unset for the
	// observer to pick by hand.
	async function fetchWeather(weatherLat: number, weatherLng: number) {
		try {
			const res = await fetch('/api/weather', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lat: weatherLat, lng: weatherLng })
			});
			if (!res.ok) return;
			const data = (await res.json()) as { observation: WeatherObservation | null };
			if (!data.observation) return;
			sessionStore.update((s) => ({
				...s,
				weatherObservationId: data.observation!.id,
				weatherObservation: data.observation,
				weather: s.weather ?? data.observation!.bucket,
				windy: !!data.observation!.windy
			}));
		} catch (err) {
			console.error('Weather fetch failed', err);
		}
	}

	// The photo upload + DeepSeek Vision read run in the background from here on — the
	// observer moves straight into the timer/count instead of waiting on them. Results
	// land in sessionStore and are shown for confirmation after the count (see
	// CardsStep), whenever the fetch below happens to resolve.
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
		// sessionId/spotId/spaceId/lat/lng/etc. were already written by
		// startProvisionalSession (and already synced) — only the fields that
		// actually change at the real start of counting are reset here.
		showFarModal = false;
		sessionStore.update((s) => ({
			...s,
			counts: {},
			taps: [],
			totalCount: 0,
			// Weather and habitat condition are captured after the count, in CardsStep.
			// If the background vision read already landed, keep its scene; otherwise fall
			// back to the spot name for now — uploadPhoto backfills this once it resolves.
			focalArea: s.focalArea || spotName,
			startedAt: nowISO(),
			step: 'observe'
		}));
		persistLocal();
	}

	onMount(() => {
		// Align the device clock to server (UTC) time early, so taps recorded
		// during the session line up with the NTP-synced site camera.
		void syncClock();
	});
</script>

{#if showFarModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
		<div class="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-background p-5 text-center shadow-xl">
			<span class="text-3xl">📍</span>
			<p class="text-sm text-foreground">
				{$_('observe.setup.proximity.farWarning', {
					values: { distance: distanceKm != null ? formatDistanceRange(distanceKm, accuracy) : '?' }
				})}
			</p>
			{#if spot.lat != null && spot.lng != null}
				<Button
					variant="outline"
					class="w-full"
					href={directionsUrl(spot.lat, spot.lng)}
					target="_blank"
					rel="noopener noreferrer"
				>
					{$_('observe.setup.proximity.directions')}
				</Button>
			{/if}
			<Button variant="default" class="w-full" onclick={beginSession}>
				{$_('observe.setup.proximity.continueAnyway')}
			</Button>
			<Button variant="ghost" size="sm" onclick={() => (showFarModal = false)}>
				{$_('observe.setup.proximity.cancel')}
			</Button>
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
				<h1 class="text-xl font-medium text-foreground">{spot.name}</h1>
				<p class="text-sm text-muted-foreground">{spot.locality}</p>
			</div>
			<Button variant="default" size="lg" class="mt-2 w-full" onclick={checkProximity}>
				{$_('observe.overview.cta')}
			</Button>
			<Button variant="ghost" size="sm" class="w-full" href="/tutorial">
				{$_('observe.overview.tutorial')}
			</Button>
		</div>
	</div>
{:else if phase === 'locating'}
	<div class="flex flex-col items-center gap-4 px-5 py-10 text-center">
		<span class="text-3xl">{spot.icon}</span>
		<h1 class="text-lg font-medium text-foreground">{spot.name}</h1>
		<Spinner size="lg" class="text-primary" />
		<p class="text-sm text-muted-foreground">{$_('observe.setup.proximity.checking')}</p>
	</div>
{:else if phase === 'photo'}
	<div class="flex flex-col items-center gap-4 px-5 py-10 text-center">
		<span class="text-4xl">📷</span>
		<div>
			<p class="text-base font-medium text-foreground">{$_('observe.setup.photo.label')}</p>
			<p class="mt-1 text-sm text-muted-foreground">{$_('observe.setup.photo.hint')}</p>
		</div>

		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			capture="environment"
			class="sr-only"
			onchange={onFileSelected}
		/>

		<Button variant="default" class="w-full" onclick={openFilePicker} disabled={preparingPhoto}>
			{$_('spot.add.photo.cta')}
		</Button>
		<Button variant="ghost" size="sm" onclick={skipPhoto}>
			{$_('observe.setup.photo.skip')}
		</Button>
	</div>
{/if}
