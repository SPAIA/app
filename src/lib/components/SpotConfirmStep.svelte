<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { sessionStore } from '$lib/stores/session';
	import type { WeatherOption } from '$lib/stores/session';
	import type { HabitatFeatureCategory, SpotVisionResult } from '$lib/types';
	import { completeSession } from '$lib/sessionSave';
	import ChipListEditor from '$lib/components/ChipListEditor.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';

	// Shown after the observer has already seen their "Your finds" cards (see
	// CardsStep) — this is where weather, habitat condition, and the spot's
	// DeepSeek Vision read (kicked off in the background from the photo step in
	// SetupStep) all get confirmed. Confirming here is also what actually saves
	// the session for good — the session has only been autosaving in the
	// background until now.

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
	let sceneDescription = $sessionStore.focalArea ?? '';
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
		if (vision.scene) sceneDescription = vision.scene;
	}

	function removePlant(index: number) {
		editablePlants = editablePlants.filter((_, i) => i !== index);
	}

	function addPlant(name: string) {
		editablePlants = [...editablePlants, { name, rank: 'type' }];
	}

	function removeFeature(index: number) {
		editableFeatures = editableFeatures.filter((_, i) => i !== index);
	}

	function addFeature(label: string) {
		editableFeatures = [...editableFeatures, { category: 'other', label }];
	}

	async function confirmAndContinue() {
		if (saving) return;
		saving = true;

		sessionStore.update((s) => ({
			...s,
			weather: selectedWeather,
			condition: condition.trim() || null,
			focalArea: sceneDescription.trim() || s.focalArea
		}));

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

		await completeSession();

		saving = false;
		sessionStore.update((s) => ({ ...s, step: 'summary' }));
	}
</script>

<div class="flex flex-col gap-4 px-5 py-6">
	<p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
		{$_('spot.add.confirm.title')}
	</p>

	{#if $sessionStore.photoUrl}
		<img src={$sessionStore.photoUrl} alt="" class="h-40 w-full rounded-xl object-cover" />
	{/if}

	{#if isNewSpot}
		<div class="flex flex-col gap-1.5">
			<Label>{$_('spot.add.confirm.name.label')}</Label>
			<Input
				type="text"
				placeholder={$_('spot.add.confirm.name.default')}
				bind:value={spotName}
			/>
		</div>
	{:else if spotName}
		<h2 class="text-base font-medium text-foreground">{spotName}</h2>
	{/if}

	{#if visionStatus === 'pending'}
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<Spinner size="sm" />
			{$_('spot.add.analyzing')}
		</div>
	{:else if visionStatus === 'done'}
		{#if vision?.changes}
			<p class="rounded-lg bg-green-light px-3 py-2.5 text-sm text-green-dark">
				{$_('spot.add.confirm.changes.label')}: {vision.changes}
			</p>
		{:else if vision?.area_mismatch}
			<p class="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">
				{$_('spot.add.confirm.area_mismatch')}
			</p>
		{/if}
		{#if vision?.scene}
			<div class="flex flex-col gap-1.5">
				<Label class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
					{$_('spot.add.confirm.scene.label')}
				</Label>
				<Textarea
					class="text-sm"
					rows={2}
					bind:value={sceneDescription}
				></Textarea>
			</div>
		{/if}

		<div>
			<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
				{$_('spot.add.confirm.plants.label')}
			</p>
			<ChipListEditor
				items={editablePlants.map((p) => p.name)}
				addPlaceholder={$_('spot.add.confirm.plants.addPlaceholder')}
				removeLabel={$_('spot.add.confirm.remove')}
				chipClass="bg-green-light text-green-dark"
				chipRemoveClass="text-green-dark/60 hover:text-green-dark"
				onAdd={addPlant}
				onRemove={removePlant}
			/>
		</div>

		<div>
			<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
				{$_('spot.add.confirm.habitat_features.label')}
			</p>
			<ChipListEditor
				items={editableFeatures.map((f) => f.label)}
				addPlaceholder={$_('spot.add.confirm.habitat_features.addPlaceholder')}
				removeLabel={$_('spot.add.confirm.remove')}
				onAdd={addFeature}
				onRemove={removeFeature}
			/>
		</div>
	{/if}

	<div>
		<p class="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
			{$_('observe.setup.weather.label')}
		</p>
		<div class="grid grid-cols-4 gap-2">
			{#each weatherOptions as w}
				<button
					class="flex flex-col items-center rounded-lg border py-2 text-xs transition-all"
					class:border-primary={selectedWeather === w.key}
					class:bg-green-light={selectedWeather === w.key}
					class:text-primary={selectedWeather === w.key}
					class:border-border={selectedWeather !== w.key}
					class:bg-background={selectedWeather !== w.key}
					onclick={() => (selectedWeather = w.key)}
				>
					<span class="mb-0.5 text-base">{w.icon}</span>
					<span class="text-center text-[9px] leading-tight text-muted-foreground">{$_(w.labelKey)}</span>
				</button>
			{/each}
		</div>
	</div>

	{#if !mediaId}
		<div class="flex flex-col gap-1.5">
			<Label>{$_('observe.setup.condition.label')}</Label>
			<Textarea
				rows={2}
				placeholder={$_('observe.setup.condition.placeholder')}
				bind:value={condition}
			></Textarea>
		</div>
	{/if}

	<Button variant="default" class="w-full" onclick={confirmAndContinue} disabled={saving || (isNewSpot && !spotName.trim())}>
		{#if saving}<Spinner size="sm" />{/if}
		{$_('spot.add.confirm.cta')}
	</Button>
</div>
