<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { sessionStore } from '$lib/stores/session';
	import type { WeatherOption } from '$lib/stores/session';
	import type { HabitatFeatureCategory, SpotVisionResult } from '$lib/types';

	// Shown right after the count finishes — this is where weather, habitat condition, and
	// the spot's DeepSeek Vision read (kicked off in the background from the photo step in
	// SetupStep) all get confirmed, instead of asking for any of it before the count starts.

	const weatherOptions: { key: WeatherOption; icon: string; labelKey: string }[] = [
		{ key: 'sunny', icon: '☀️', labelKey: 'weather.sunny' },
		{ key: 'partly', icon: '⛅', labelKey: 'weather.partly' },
		{ key: 'overcast', icon: '☁️', labelKey: 'weather.overcast' },
		{ key: 'rainy', icon: '🌧️', labelKey: 'weather.rainy' }
	];

	let selectedWeather: WeatherOption | null = $sessionStore.weather;
	let condition = $sessionStore.condition ?? '';
	let spotName = $sessionStore.spotName ?? '';
	let editablePlants: { name: string; rank: SpotVisionResult['plants'][number]['rank'] }[] = [];
	let editableFeatures: { category: HabitatFeatureCategory; label: string }[] = [];
	let newPlantName = '';
	let newFeatureLabel = '';
	let saving = false;
	let seeded = false;

	$: vision = $sessionStore.vision;
	$: visionStatus = $sessionStore.visionStatus;
	$: mediaId = $sessionStore.mediaId;
	$: isNewSpot = $sessionStore.isNewSpot;
	$: spotId = $sessionStore.spotId;

	$: if (!seeded && vision) {
		seeded = true;
		editablePlants = [...vision.plants];
		editableFeatures = [...vision.habitat_features];
		if (isNewSpot) spotName = vision.name;
		if (selectedWeather == null && vision.weather) selectedWeather = vision.weather;
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

	async function confirmAndContinue() {
		if (saving) return;
		saving = true;

		sessionStore.update((s) => ({ ...s, weather: selectedWeather, condition: condition.trim() || null }));

		if (isNewSpot && spotId) {
			const finalName = spotName.trim() || $_('spot.add.confirm.name.default');
			spotName = finalName;

			try {
				await fetch(`/api/spot/${spotId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: finalName })
				});
				sessionStore.update((s) => ({ ...s, spotName: finalName }));
			} catch {
				// non-blocking — the AI-suggested name still stands server-side
			}
		}

		if (vision && mediaId && spotId) {
			try {
				await fetch(`/api/spot/${spotId}/vision`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ mediaId, plants: editablePlants, habitat_features: editableFeatures })
				});
			} catch {
				// non-blocking — the AI-guessed plants/features still stand server-side
			}
		}

		saving = false;
		sessionStore.update((s) => ({ ...s, step: 'cards' }));
	}
</script>

<div class="flex flex-col gap-4 px-5 py-6">
	<p class="text-xs font-medium uppercase tracking-widest text-base-content/50">
		{$_('spot.add.confirm.title')}
	</p>

	{#if $sessionStore.photoUrl}
		<img src={$sessionStore.photoUrl} alt="" class="h-40 w-full rounded-xl object-cover" />
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
	{:else if spotName}
		<h2 class="text-base font-medium text-base-content">{spotName}</h2>
	{/if}

	{#if visionStatus === 'pending'}
		<div class="flex items-center gap-2 text-sm text-base-content/50">
			<span class="loading loading-spinner loading-sm"></span>
			{$_('spot.add.analyzing')}
		</div>
	{:else if visionStatus === 'done'}
		{#if vision?.changes}
			<p class="rounded-lg bg-green-light px-3 py-2.5 text-sm text-green-dark">
				{$_('spot.add.confirm.changes.label')}: {vision.changes}
			</p>
		{/if}
		{#if vision?.scene}
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

	{#if !mediaId}
		<label class="form-control">
			<div class="label"><span class="label-text">{$_('observe.setup.condition.label')}</span></div>
			<textarea
				class="textarea textarea-bordered w-full"
				rows="2"
				placeholder={$_('observe.setup.condition.placeholder')}
				bind:value={condition}
			></textarea>
		</label>
	{/if}

	<button class="btn btn-primary w-full" onclick={confirmAndContinue} disabled={saving || (isNewSpot && !spotName.trim())}>
		{#if saving}<span class="loading loading-spinner loading-sm"></span>{/if}
		{$_('spot.add.confirm.cta')}
	</button>
</div>
