<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { completeSession } from '$lib/sessionSave';
	import InsectCard from './InsectCard.svelte';
	import type { InsectType } from '$lib/types';

	export let insectTypes: InsectType[] = [];

	$: tappedTypes = Object.entries($sessionStore.counts)
		.filter(([, count]) => count > 0)
		.map(([name, count]) => {
			const it = insectTypes.find((i) => i.name === name);
			return it ? { ...it, count } : null;
		})
		.filter(Boolean) as (InsectType & { count: number })[];

	$: lockedCount = Math.max(0, 8 - tappedTypes.length);
	$: lockedSlots = Array.from({ length: lockedCount });
	$: lockedLabel = $_('cards.locked');

	let saving = false;

	// The session has been autosaving throughout the observation (see
	// ObserveStep) — this just sends any last taps and marks it complete.
	async function saveAndFinish() {
		if (saving) return;
		saving = true;

		await completeSession();

		sessionStore.update((st) => ({ ...st, step: 'summary' }));
		saving = false;
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

	<!-- Cards grid -->
	<div class="grid grid-cols-2 gap-2.5">
		{#each tappedTypes as insect}
			<InsectCard
				name={insect.name}
				count={insect.count}
			/>
		{/each}
		{#each lockedSlots as _}
			<div class="flex flex-col items-center gap-1.5 rounded-xl border border-base-300 bg-base-200 px-2 py-4 opacity-40">
				<span class="text-xl text-base-content/30">🔒</span>
				<span class="text-[11px] text-base-content/40">{lockedLabel}</span>
			</div>
		{/each}
	</div>

	{#if $sessionStore.locality && $sessionStore.totalCount > 0}
		<p class="rounded-lg bg-green-light px-3 py-2.5 text-sm text-green-dark">
			{$_('cards.impact', { values: { count: $sessionStore.totalCount, locality: $sessionStore.locality } })}
		</p>
	{/if}

	<div class="flex flex-col gap-2">
		<button class="btn btn-primary w-full" onclick={saveAndFinish} disabled={saving}>
			{#if saving}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$_('cards.cta.save')}
		</button>
		<button class="btn btn-outline btn-sm w-full" onclick={() => goto('/explore')}>
			{$_('cards.cta.explore')}
		</button>
	</div>
</div>
