<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import InsectCard from './InsectCard.svelte';
	import type { InsectType, SpotSessionComparison } from '$lib/types';

	export let insectTypes: InsectType[] = [];

	$: tappedTypes = Object.entries($sessionStore.counts)
		.filter(([, count]) => count > 0)
		.map(([name, count]) => {
			const it = insectTypes.find((i) => i.name === name);
			return it ? { ...it, count } : null;
		})
		.filter(Boolean) as (InsectType & { count: number })[];

	let comparison: SpotSessionComparison | null = null;
	let spotInsectCounts: { name: string; count: number }[] = [];
	let spotMinutesObserved = 0;

	// The session isn't marked complete until the environmental confirm step
	// (see SpotConfirmStep) — but the comparison, and the spot's running totals
	// below, only ever look at history, so it's safe to read both here already.
	onMount(async () => {
		const spotId = $sessionStore.spotId;
		const sessionId = $sessionStore.sessionId;
		if (!spotId || !sessionId) return;
		try {
			const [comparisonRes, summaryRes] = await Promise.all([
				fetch(`/api/spot/${spotId}/comparison?exclude=${sessionId}`),
				fetch(`/api/spot/${spotId}/summary`)
			]);
			if (comparisonRes.ok) {
				const data = (await comparisonRes.json()) as { comparison: SpotSessionComparison };
				comparison = data.comparison;
			}
			if (summaryRes.ok) {
				const data = (await summaryRes.json()) as {
					totalMinutesObserved: number;
					insectCounts: { name: string; count: number }[];
				};
				spotMinutesObserved = data.totalMinutesObserved;
				spotInsectCounts = data.insectCounts;
			}
		} catch {
			// non-blocking — the cards still show fine without this
		}
	});

	// Historical sightings-per-minute rate for this species at this spot, scaled to this
	// session's length — e.g. 20 sightings over 100 min observed, in a 10-min session, is 2.
	// The stored count already includes this in-progress session's own taps (autosave writes
	// them as they happen), so those are subtracted back out first to keep this a fair,
	// purely historical average.
	function avgForSpecies(name: string): number | null {
		if (spotMinutesObserved <= 0) return null;
		const stored = spotInsectCounts.find((i) => i.name === name)?.count ?? 0;
		const ownTaps = $sessionStore.counts[name] ?? 0;
		const historical = Math.max(0, stored - ownTaps);
		return (historical / spotMinutesObserved) * $sessionStore.totalDurationMin;
	}

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

	function continueToConfirm() {
		sessionStore.update((st) => ({ ...st, step: 'confirm' }));
	}
</script>

<div class="flex flex-col gap-4 px-5 py-6">
	<p class="text-xs font-medium uppercase tracking-widest text-base-content/50">
		{$_('cards.title')}
	</p>

	<!-- Stats row -->
	<div class="grid grid-cols-2 gap-2">
		<div class="rounded-lg border border-base-300 bg-base-200 py-2.5 text-center">
			<div class="text-xl font-medium text-primary">{$sessionStore.totalCount}</div>
			<div class="mt-0.5 text-[9px] uppercase tracking-wide text-base-content/50">{$_('cards.stats.sightings')}</div>
		</div>
		<div class="rounded-lg border border-base-300 bg-base-200 py-2.5 text-center">
			<div class="text-xl font-medium text-primary">{tappedTypes.length}</div>
			<div class="mt-0.5 text-[9px] uppercase tracking-wide text-base-content/50">{$_('cards.stats.types')}</div>
		</div>
	</div>

	<!-- How this session compares to the spot's history, from any user -->
	{#if comparison}
		<div class="rounded-xl border border-base-300 bg-base-100 px-4 py-4">
			{#if comparison.lastSession}
				{#if diff > 0}
					<p class="text-sm text-base-content">
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
					<p class="text-sm text-base-content">
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
					<p class="text-sm text-base-content">
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
				<p class="text-sm text-base-content">{$_('cards.compare.first')}</p>
			{/if}
			{#if comparison.average}
				<p class="mt-1.5 text-xs text-base-content/50">
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

	<!-- Sightings grid -->
	<div class="grid grid-cols-2 gap-2.5">
		{#each tappedTypes as insect}
			<InsectCard
				name={insect.name}
				count={insect.count}
				avg={avgForSpecies(insect.name)}
			/>
		{/each}
	</div>

	{#if $sessionStore.locality && $sessionStore.totalCount > 0}
		<p class="rounded-lg bg-green-light px-3 py-2.5 text-sm text-green-dark">
			{$_('cards.impact', { values: { count: $sessionStore.totalCount, locality: $sessionStore.locality } })}
		</p>
	{/if}

	<div class="flex flex-col gap-2">
		<button class="btn btn-primary w-full" onclick={continueToConfirm}>
			{$_('cards.cta.continue')}
		</button>
		<button class="btn btn-outline btn-sm w-full" onclick={() => goto('/explore')}>
			{$_('cards.cta.explore')}
		</button>
	</div>
</div>
