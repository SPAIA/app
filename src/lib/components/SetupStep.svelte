<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { sessionStore } from '$lib/stores/session';
	import type { WeatherOption } from '$lib/stores/session';
	import type { HabitatFeatureCategory, Spot, SpotVisionResult } from '$lib/types';
	import { syncClock, clockOffsetMs, timeOfDayLabel } from '$lib/time';
	import { resizeImageFile } from '$lib/media/resizeImage';
	import { haversineKm, directionsUrl, formatDistanceRange } from '$lib/geo';
	import { trackLocalSessionId } from '$lib/localSessions';
	import { resetSaveProgress } from '$lib/sessionSave';

	export let spot: Spot & { locality: string };

	// If you're far from the spot we just warn — doesn't block observing.
	const PROXIMITY_THRESHOLD_KM = 0.1;

	type Phase = 'locating' | 'gpsError' | 'photo' | 'analyzing' | 'confirm' | 'weatherFallback' | 'details';
	let phase: Phase = 'locating';
	let showFarWarning = false;

	const durations = [1, 3, 5, 10];
	const weatherOptions: { key: WeatherOption; icon: string; labelKey: string }[] = [
		{ key: 'sunny', icon: '☀️', labelKey: 'weather.sunny' },
		{ key: 'partly', icon: '⛅', labelKey: 'weather.partly' },
		{ key: 'overcast', icon: '☁️', labelKey: 'weather.overcast' },
		{ key: 'rainy', icon: '🌧️', labelKey: 'weather.rainy' }
	];

	let selectedDuration = 10;
	let selectedWeather: WeatherOption | null = null;
	let condition = '';
	let lat: number | null = null;
	let lng: number | null = null;
	let distanceKm: number | null = null;
	let accuracy: number | null = null;

	let sessionId: string | null = null;
	let spotName = spot.name;
	let isNewSpot = false;
	let photoUrl: string | null = null;
	let mediaId: string | null = null;
	let vision: SpotVisionResult | null = null;
	let editablePlants: { name: string; rank: SpotVisionResult['plants'][number]['rank'] }[] = [];
	let editableFeatures: { category: HabitatFeatureCategory; label: string }[] = [];
	let newPlantName = '';
	let newFeatureLabel = '';
	let fileInput: HTMLInputElement;
	let uploadingPhoto = false;

	let error = '';

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

	async function onFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || sessionId == null) return;

		phase = 'analyzing';
		error = '';
		uploadingPhoto = true;

		try {
			const resized = await resizeImageFile(file);

			const form = new FormData();
			form.append('file', resized);
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
			photoUrl = data.media.url;
			mediaId = data.media.id;
			vision = data.vision;
			editablePlants = data.vision ? [...data.vision.plants] : [];
			editableFeatures = data.vision ? [...data.vision.habitat_features] : [];
			isNewSpot = data.isNewSpot;
			selectedWeather = data.vision?.weather ?? null;
			if (data.isNewSpot) spotName = data.spot.name;
		} catch {
			error = $_('spot.add.error.generic');
		} finally {
			uploadingPhoto = false;
			input.value = '';
			phase = 'confirm';
		}
	}

	function skipPhoto() {
		phase = 'weatherFallback';
	}

	function removePlant(index: number) {
		editablePlants = editablePlants.filter((_, i) => i !== index);
	}

	function addPlant() {
		const name = newPlantName.trim();
		if (!name) return;
		editablePlants = [...editablePlants, { name, rank: 'type' }];
		newPlantName = '';
	}

	function removeFeature(index: number) {
		editableFeatures = editableFeatures.filter((_, i) => i !== index);
	}

	function addFeature() {
		const label = newFeatureLabel.trim();
		if (!label) return;
		editableFeatures = [...editableFeatures, { category: 'other', label }];
		newFeatureLabel = '';
	}

	async function confirmSpot() {
		if (isNewSpot) {
			const finalName = spotName.trim() || $_('spot.add.confirm.name.default');
			spotName = finalName;

			try {
				await fetch(`/api/spot/${spot.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: finalName })
				});
			} catch {
				// non-blocking — the AI-suggested name still stands server-side
			}
		}

		if (vision && mediaId) {
			try {
				await fetch(`/api/spot/${spot.id}/vision`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ mediaId, plants: editablePlants, habitat_features: editableFeatures })
				});
			} catch {
				// non-blocking — the AI-guessed plants/features still stand server-side
			}
		}

		phase = 'details';
	}

	function continueFromWeatherFallback() {
		phase = 'details';
	}

	function handleBegin() {
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
			weather: selectedWeather,
			condition: condition.trim() || null,
			focalArea: vision?.scene || spotName,
			lat,
			lng,
			durationMin: selectedDuration,
			totalDurationMin: selectedDuration,
			clockOffsetMs: clockOffsetMs(),
			step: 'intro'
		}));
	}

	onMount(() => {
		// Align the device clock to server (UTC) time early, so taps recorded
		// during the session line up with the NTP-synced site camera.
		void syncClock();
		checkProximity();
	});

	$: ctaCopy = $_('observe.cta', { values: { locality: spot.locality } });
</script>

{#if showFarWarning}
	<div class="alert alert-warning mx-5 mt-4 flex items-start justify-between gap-3 text-sm">
		<span>
			{$_('observe.setup.proximity.farWarning', {
				values: { distance: distanceKm != null ? formatDistanceRange(distanceKm, accuracy) : '?' }
			})}
		</span>
		<div class="flex shrink-0 items-center gap-2">
			{#if spot.lat != null && spot.lng != null}
				<a
					class="link whitespace-nowrap text-xs font-medium"
					href={directionsUrl(spot.lat, spot.lng)}
					target="_blank"
					rel="noopener noreferrer"
				>
					{$_('observe.setup.proximity.directions')}
				</a>
			{/if}
			<button
				type="button"
				class="text-lg leading-none"
				aria-label={$_('spot.add.confirm.remove')}
				onclick={() => (showFarWarning = false)}
			>
				&times;
			</button>
		</div>
	</div>
{/if}

{#if phase === 'locating' || phase === 'gpsError'}
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
			class="hidden"
			onchange={onFileSelected}
		/>

		<button class="btn btn-primary w-full" onclick={openFilePicker} disabled={uploadingPhoto}>
			{$_('spot.add.photo.cta')}
		</button>
		<button class="btn btn-ghost btn-sm" onclick={skipPhoto}>
			{$_('observe.setup.photo.skip')}
		</button>
	</div>
{:else if phase === 'weatherFallback'}
	<div class="flex flex-col gap-4 px-5 py-6">
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-widest text-base-content/50">
				{$_('observe.setup.weather.label')}
			</p>
			<div class="grid grid-cols-4 gap-2">
				{#each weatherOptions as w}
					<button
						class="flex flex-col items-center rounded-lg border py-2 text-xs transition-all"
						class:border-primary={selectedWeather === w.key}
						class:bg-green-light={selectedWeather === w.key}
						class:text-primary={selectedWeather === w.key}
						class:border-base-300={selectedWeather !== w.key}
						class:bg-base-100={selectedWeather !== w.key}
						onclick={() => (selectedWeather = w.key)}
					>
						<span class="mb-0.5 text-base">{w.icon}</span>
						<span class="text-center text-[9px] leading-tight text-base-content/60">{$_(w.labelKey)}</span>
					</button>
				{/each}
			</div>
		</div>

		<label class="form-control">
			<div class="label"><span class="label-text">{$_('observe.setup.condition.label')}</span></div>
			<textarea
				class="textarea textarea-bordered w-full"
				rows="2"
				placeholder={$_('observe.setup.condition.placeholder')}
				bind:value={condition}
			></textarea>
		</label>

		<button class="btn btn-primary w-full" onclick={continueFromWeatherFallback}>
			{$_('spot.add.location.continue')}
		</button>
	</div>
{:else if phase === 'analyzing'}
	<div class="flex flex-col items-center gap-4 px-5 py-16 text-center">
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<p class="text-sm text-base-content/50">{$_('spot.add.analyzing')}</p>
	</div>
{:else if phase === 'confirm'}
	<div class="flex flex-col gap-4 px-5 py-6">
		{#if photoUrl}
			<img src={photoUrl} alt="" class="h-40 w-full rounded-xl object-cover" />
		{/if}

		{#if error}
			<div class="alert alert-error text-sm">{error}</div>
		{/if}

		{#if isNewSpot}
			<label class="form-control">
				<div class="label"><span class="label-text">{$_('spot.add.confirm.name.label')}</span></div>
				<input
					type="text"
					class="input input-bordered w-full"
					placeholder={$_('spot.add.confirm.name.default')}
					bind:value={spotName}
				/>
			</label>
		{:else}
			<h2 class="text-base font-medium text-base-content">{spotName}</h2>
		{/if}

		{#if vision}
			{#if vision.changes}
				<p class="rounded-lg bg-green-light px-3 py-2.5 text-sm text-green-dark">
					{$_('spot.add.confirm.changes.label')}: {vision.changes}
				</p>
			{/if}
			{#if vision.scene}
				<p class="text-sm text-base-content/70">{vision.scene}</p>
			{/if}
			<div>
				<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-base-content/50">
					{$_('spot.add.confirm.plants.label')}
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each editablePlants as plant, i}
						<span class="flex items-center gap-1 rounded-full bg-green-light px-2.5 py-1 text-xs text-green-dark">
							{plant.name}
							<button
								type="button"
								class="text-green-dark/60 hover:text-green-dark"
								aria-label={$_('spot.add.confirm.remove')}
								onclick={() => removePlant(i)}
							>
								&times;
							</button>
						</span>
					{/each}
				</div>
				<div class="mt-1.5 flex gap-1.5">
					<input
						type="text"
						class="input input-bordered input-sm flex-1"
						placeholder={$_('spot.add.confirm.plants.addPlaceholder')}
						bind:value={newPlantName}
						onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addPlant())}
					/>
					<button type="button" class="btn btn-sm btn-outline" onclick={addPlant}>
						{$_('spot.add.confirm.add')}
					</button>
				</div>
			</div>
			<div>
				<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-base-content/50">
					{$_('spot.add.confirm.habitat_features.label')}
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each editableFeatures as feature, i}
						<span class="flex items-center gap-1 rounded-full bg-base-200 px-2.5 py-1 text-xs text-base-content/70">
							{feature.label}
							<button
								type="button"
								class="text-base-content/40 hover:text-base-content/70"
								aria-label={$_('spot.add.confirm.remove')}
								onclick={() => removeFeature(i)}
							>
								&times;
							</button>
						</span>
					{/each}
				</div>
				<div class="mt-1.5 flex gap-1.5">
					<input
						type="text"
						class="input input-bordered input-sm flex-1"
						placeholder={$_('spot.add.confirm.habitat_features.addPlaceholder')}
						bind:value={newFeatureLabel}
						onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
					/>
					<button type="button" class="btn btn-sm btn-outline" onclick={addFeature}>
						{$_('spot.add.confirm.add')}
					</button>
				</div>
			</div>
		{/if}

		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-widest text-base-content/50">
				{$_('observe.setup.weather.label')}
			</p>
			<div class="grid grid-cols-4 gap-2">
				{#each weatherOptions as w}
					<button
						class="flex flex-col items-center rounded-lg border py-2 text-xs transition-all"
						class:border-primary={selectedWeather === w.key}
						class:bg-green-light={selectedWeather === w.key}
						class:text-primary={selectedWeather === w.key}
						class:border-base-300={selectedWeather !== w.key}
						class:bg-base-100={selectedWeather !== w.key}
						onclick={() => (selectedWeather = w.key)}
					>
						<span class="mb-0.5 text-base">{w.icon}</span>
						<span class="text-center text-[9px] leading-tight text-base-content/60">{$_(w.labelKey)}</span>
					</button>
				{/each}
			</div>
		</div>

		<button class="btn btn-primary w-full" onclick={confirmSpot} disabled={isNewSpot && !spotName.trim()}>
			{$_('spot.add.confirm.cta')}
		</button>
	</div>
{:else if phase === 'details'}
	<div class="flex flex-col gap-4 px-5 py-6">
		<div class="rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
			📍 {spotName} · {spot.locality}
		</div>

		<!-- Timer picker -->
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-widest text-base-content/50">
				{$_('observe.setup.timer.label')}
			</p>
			<div class="grid grid-cols-4 gap-2">
				{#each durations as d}
					<button
						class="rounded-lg border py-2.5 text-sm font-medium transition-all"
						class:border-primary={selectedDuration === d}
						class:bg-green-light={selectedDuration === d}
						class:text-primary={selectedDuration === d}
						class:border-base-300={selectedDuration !== d}
						class:bg-base-100={selectedDuration !== d}
						onclick={() => (selectedDuration = d)}
					>
						{d}<span class="text-xs">m</span>
					</button>
				{/each}
			</div>
		</div>

		<button class="btn btn-primary mt-2 w-full" onclick={handleBegin}>
			{ctaCopy}
		</button>
	</div>
{/if}
