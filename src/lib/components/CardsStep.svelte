<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import type { WeatherOption, WindOption } from '$lib/stores/session';
	import InsectCard from './InsectCard.svelte';
	import type { HabitatFeatureCategory, InsectType, SpotSessionComparison, SpotVisionResult } from '$lib/types';
	import { completeSession } from '$lib/sessionSave';
	import ChipListEditor from '$lib/components/ChipListEditor.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Card, CardHeader, CardTitle, CardAction, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';

	// The post-count screen: the count itself is the reward and sits at the
	// top, followed by everything optional — the spot's photo read, weather,
	// wind, other wildlife, and notes. Nothing below the count blocks saving.
	// Saving here is also what actually persists the session for good — it
	// has only been autosaving in the background until now.

	export let insectTypes: InsectType[] = [];

	$: tappedTypes = Object.entries($sessionStore.counts)
		.filter(([, count]) => count > 0)
		.map(([name, count]) => {
			const it = insectTypes.find((i) => i.name === name);
			return it ? { ...it, count } : null;
		})
		.filter(Boolean) as (InsectType & { count: number })[];

	let comparison: SpotSessionComparison | null = null;

	// The session isn't marked complete until saveObservation runs below — but
	// the comparison only ever looks at history, so it's safe to read it here already.
	onMount(async () => {
		const spotId = $sessionStore.spotId;
		const sessionId = $sessionStore.sessionId;
		if (!spotId || !sessionId) return;
		try {
			const comparisonRes = await fetch(`/api/spot/${spotId}/comparison?exclude=${sessionId}`);
			if (comparisonRes.ok) {
				const data = (await comparisonRes.json()) as { comparison: SpotSessionComparison };
				comparison = data.comparison;
			}
		} catch {
			// non-blocking — the cards still show fine without this
		}
	});

	// Only read when comparison.lastSession is set — 0 otherwise, just to keep this typed as a plain number.
	$: diff = comparison?.lastSession ? $sessionStore.totalCount - comparison.lastSession.totalCount : 0;

	// Sessions are stamped with SQLite's datetime('now'), e.g. "2026-08-23 20:57:10" — no
	// timezone, so treat it as UTC (matches the "Since last visit" formatting on /explore).
	function daysSince(sqliteDatetime: string): number {
		const iso = sqliteDatetime.includes('T') ? sqliteDatetime : `${sqliteDatetime.replace(' ', 'T')}Z`;
		const diffMs = Date.now() - new Date(iso).getTime();
		return Math.max(0, Math.floor(diffMs / 86400000));
	}

	function lastVisitWhenLabel(completedAt: string): string {
		const days = daysSince(completedAt);
		if (days === 0) return $_('cards.compare.when.today');
		if (days === 1) return $_('cards.compare.when.yesterday');
		return $_('cards.compare.when.daysAgo', { values: { days } });
	}

	$: lastVisitWhen = comparison?.lastSession ? lastVisitWhenLabel(comparison.lastSession.completedAt) : '';

	const weatherIcons: Record<WeatherOption, string> = {
		sunny: '☀️',
		partly: '⛅',
		overcast: '☁️',
		rainy: '🌧️'
	};

	// Paired with the automatic DWD wind_speed_kmh reading (see the windy badge below) —
	// wind inside a food forest is not wind at the station, so neither overwrites the other.
	const windOptions: { key: WindOption; labelKey: string }[] = [
		{ key: 'still', labelKey: 'wind.still' },
		{ key: 'light_breeze', labelKey: 'wind.lightBreeze' },
		{ key: 'leaves_moving', labelKey: 'wind.leavesMoving' },
		{ key: 'branches_moving', labelKey: 'wind.branchesMoving' }
	];

	const creatureOptions: { key: string; icon: string; labelKey: string }[] = [
		{ key: 'snail', icon: '🐌', labelKey: 'cards.otherCreatures.snail' },
		{ key: 'mouse', icon: '🐭', labelKey: 'cards.otherCreatures.mouse' },
		{ key: 'worm', icon: '🪱', labelKey: 'cards.otherCreatures.worm' },
		{ key: 'spider', icon: '🕷️', labelKey: 'cards.otherCreatures.spider' },
		{ key: 'bird', icon: '🐦', labelKey: 'cards.otherCreatures.bird' },
		{ key: 'hedgehog', icon: '🦔', labelKey: 'cards.otherCreatures.hedgehog' }
	];

	let selectedWind: WindOption | null = $sessionStore.windObserved;
	let condition = $sessionStore.condition ?? '';
	let notes = $sessionStore.notes ?? '';
	let spotName = $sessionStore.spotName ?? '';
	let editablePlants: { name: string; rank: SpotVisionResult['plants'][number]['rank'] }[] = [];
	let editableFeatures: { category: HabitatFeatureCategory; label: string }[] = [];
	let sceneDescription = $sessionStore.focalArea ?? '';
	let selectedCreatures: string[] = $sessionStore.otherCreatures.map((c) => c.creature).filter((c) => c !== 'other');
	let otherCreatureLabel = $sessionStore.otherCreatures.find((c) => c.creature === 'other')?.label ?? '';
	let showOtherCreatureInput = !!otherCreatureLabel;
	let saving = false;
	let seeded = false;

	$: vision = $sessionStore.vision;
	$: visionStatus = $sessionStore.visionStatus;
	$: mediaId = $sessionStore.mediaId;
	$: isNewSpot = $sessionStore.isNewSpot;
	$: spotId = $sessionStore.spotId;
	$: windy = $sessionStore.windy;
	$: weatherObservation = $sessionStore.weatherObservation;
	// The station name/distance are real fields off the Bright Sky reading, not a
	// static "auto" label — falls back to a generic label only if a reading somehow
	// carries no station (current_weather always returns one in practice).
	$: weatherSourceLabel = !weatherObservation
		? ''
		: weatherObservation.source !== 'brightsky'
			? $_('weather.source.manual')
			: weatherObservation.station_name
				? $_('weather.source.auto', { values: { station: weatherObservation.station_name } })
				: $_('weather.source.autoGeneric');

	$: if (!seeded && vision) {
		seeded = true;
		editablePlants = [...vision.plants];
		editableFeatures = [...vision.habitat_features];
		if (isNewSpot) spotName = vision.name;
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

	function toggleCreature(key: string) {
		selectedCreatures = selectedCreatures.includes(key)
			? selectedCreatures.filter((c) => c !== key)
			: [...selectedCreatures, key];
	}

	function toggleOtherCreature() {
		showOtherCreatureInput = !showOtherCreatureInput;
		if (!showOtherCreatureInput) otherCreatureLabel = '';
	}

	async function saveObservation() {
		if (saving) return;
		saving = true;

		const otherCreatures = [
			...selectedCreatures.map((creature) => ({ creature, label: null })),
			...(showOtherCreatureInput && otherCreatureLabel.trim()
				? [{ creature: 'other', label: otherCreatureLabel.trim() }]
				: [])
		];

		sessionStore.update((s) => ({
			...s,
			condition: condition.trim() || null,
			notes: notes.trim(),
			windObserved: selectedWind,
			otherCreatures,
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
	<Card class="rounded-xl border border-border shadow-none ring-0">
		<CardHeader>
			<CardTitle>{$_('cards.title')}</CardTitle>
			{#if comparison?.lastSession && diff !== 0}
				<CardAction>
					<Badge variant={diff > 0 ? 'default' : 'secondary'}>
						{diff > 0 ? '+' : ''}{diff}
					</Badge>
				</CardAction>
			{/if}
		</CardHeader>
		<CardContent class="flex flex-col gap-3">
			<!-- The count itself is the reward — biggest thing on the screen. -->
			<div class="py-1 text-center">
				<div class="spaia-display text-primary">{$sessionStore.totalCount}</div>
				<p class="mt-1 text-sm text-muted-foreground">
					{$_('cards.hero.sub', { values: { duration: $sessionStore.totalDurationMin, spot: $sessionStore.spotName ?? '' } })}
				</p>
			</div>

			<div class="spaia-inset mx-auto w-fit min-w-36 text-center">
				<div class="spaia-inset-value text-primary">{tappedTypes.length}</div>
				<div class="spaia-inset-label mt-1">{$_('cards.stats.types')}</div>
			</div>

			<!-- How this session compares to the spot's history, from any user -->
			{#if comparison}
				<div class="spaia-inset">
					{#if comparison.lastSession}
						{#if diff > 0}
							<p class="text-sm text-foreground">
								{$_('cards.compare.more', {
									values: {
										diff,
										when: lastVisitWhen,
										lastCount: comparison.lastSession.totalCount,
										lastDuration: comparison.lastSession.durationMin
									}
								})}
							</p>
						{:else if diff < 0}
							<p class="text-sm text-foreground">
								{$_('cards.compare.fewer', {
									values: {
										diff: Math.abs(diff),
										when: lastVisitWhen,
										lastCount: comparison.lastSession.totalCount,
										lastDuration: comparison.lastSession.durationMin
									}
								})}
							</p>
						{:else}
							<p class="text-sm text-foreground">
								{$_('cards.compare.same', {
									values: {
										when: lastVisitWhen,
										lastCount: comparison.lastSession.totalCount,
										lastDuration: comparison.lastSession.durationMin
									}
								})}
							</p>
						{/if}
					{:else}
						<p class="text-sm text-foreground">{$_('cards.compare.first')}</p>
					{/if}
					{#if comparison.average}
						<p class="mt-1.5 text-xs text-muted-foreground">
							{$_('cards.compare.average', {
								values: {
									avgCount: Math.round(comparison.average.totalCount),
									avgDuration: Math.round(comparison.average.durationMin)
								}
							})}
						</p>
					{/if}
				</div>
			{/if}
		</CardContent>

		{#if tappedTypes.length}
			<Separator />
			<CardContent class="flex flex-col gap-3">
				<p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
					{$_('cards.whatYouCounted')}
				</p>
				<div class="grid grid-cols-2 gap-x-4 gap-y-3">
					{#each tappedTypes as insect}
						<InsectCard name={insect.name} count={insect.count} />
					{/each}
				</div>
			</CardContent>
		{/if}
	</Card>

	{#if $sessionStore.locality && $sessionStore.totalCount > 0}
		<p class="rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground">
			{$_('cards.impact', { values: { count: $sessionStore.totalCount, locality: $sessionStore.locality } })}
		</p>
	{/if}

	<!-- What the spot looked like -->
	<p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
		{$_('spot.confirm.section.lookedLike')}
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
		<p class="text-xs text-muted-foreground">{$_('spot.add.confirm.photoRead')}</p>
		{#if vision?.changes}
			<p class="rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground">
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
				chipClass="bg-accent text-accent-foreground"
				chipRemoveClass="text-accent-foreground/60 hover:text-accent-foreground"
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

	<!-- Conditions -->
	<p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
		{$_('spot.confirm.section.conditions')}
	</p>

	{#if weatherObservation}
		<div class="spaia-inset">
			<div class="flex flex-wrap items-center gap-3">
				<span class="spaia-inset-value text-primary">
					{Math.round(weatherObservation.temperature_c ?? 0)}°C
				</span>
				<span class="flex items-center gap-1.5 text-sm font-medium text-foreground">
					<span>{weatherIcons[weatherObservation.bucket]}</span>
					{$_('weather.' + weatherObservation.bucket)}
				</span>
				{#if windy}
					<Badge variant="secondary">💨 {$_('weather.windy')}</Badge>
				{/if}
			</div>
			<p class="spaia-inset-label mt-1.5">
				{weatherSourceLabel}
			</p>
		</div>
	{/if}

	<div>
		<p class="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
			{$_('wind.label')}
		</p>
		<div class="grid grid-cols-2 gap-2">
			{#each windOptions as w}
				<button
					type="button"
					class="rounded-lg border py-2 text-xs transition-all"
					class:border-primary={selectedWind === w.key}
					class:bg-accent={selectedWind === w.key}
					class:text-primary={selectedWind === w.key}
					class:border-border={selectedWind !== w.key}
					class:bg-background={selectedWind !== w.key}
					onclick={() => (selectedWind = w.key)}
				>
					{$_(w.labelKey)}
				</button>
			{/each}
		</div>
	</div>

	<!-- Also spotted -->
	<div>
		<p class="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
			{$_('cards.otherCreatures.label')}
		</p>
		<div class="flex flex-wrap gap-2">
			{#each creatureOptions as c}
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all"
					class:border-primary={selectedCreatures.includes(c.key)}
					class:bg-accent={selectedCreatures.includes(c.key)}
					class:text-primary={selectedCreatures.includes(c.key)}
					class:border-border={!selectedCreatures.includes(c.key)}
					onclick={() => toggleCreature(c.key)}
				>
					<span>{c.icon}</span>
					<span>{$_(c.labelKey)}</span>
				</button>
			{/each}
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all"
				class:border-primary={showOtherCreatureInput}
				class:bg-accent={showOtherCreatureInput}
				class:text-primary={showOtherCreatureInput}
				class:border-border={!showOtherCreatureInput}
				onclick={toggleOtherCreature}
			>
				+ {$_('cards.otherCreatures.other')}
			</button>
		</div>
		{#if showOtherCreatureInput}
			<Input
				type="text"
				class="mt-2 text-sm"
				placeholder={$_('cards.otherCreatures.otherPlaceholder')}
				bind:value={otherCreatureLabel}
			/>
		{/if}
	</div>

	<div class="flex flex-col gap-1.5">
		<Label>{$_('observe.confirm.notes.label')}</Label>
		<Textarea
			rows={2}
			placeholder={$_('observe.confirm.notes.placeholder')}
			bind:value={notes}
		></Textarea>
	</div>

	<div class="flex flex-col gap-2">
		<Button variant="default" class="w-full" onclick={saveObservation} disabled={saving || (isNewSpot && !spotName.trim())}>
			{#if saving}<Spinner size="sm" />{/if}
			{$_('spot.add.confirm.cta')}
		</Button>
		<Button variant="outline" size="sm" class="w-full" onclick={() => goto('/explore')}>
			{$_('cards.cta.explore')}
		</Button>
	</div>
</div>
