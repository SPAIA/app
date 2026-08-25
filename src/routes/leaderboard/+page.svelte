<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	// User's locality (could come from profile/localStorage in future — default Moabit for demo)
	const userLocality = 'Moabit';

	const rankStyles: Record<number, string> = {
		1: 'text-accent font-bold',
		2: 'text-base-content/50 font-semibold',
		3: 'font-semibold text-[#854F0B]'
	};

	$: leader = data.leaderboard[0];
	$: userRow = data.leaderboard.find((r) => r.locality === userLocality);
	$: userRank = data.leaderboard.findIndex((r) => r.locality === userLocality) + 1;
	$: gap = leader && userRow ? leader.total_sightings - userRow.total_sightings : 0;
</script>

<svelte:head>
	<title>{$_('leaderboard.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	<p class="text-xs font-medium uppercase tracking-widest text-base-content/50">
		{$_('leaderboard.title')}
	</p>
	<h2 class="text-xl font-medium text-base-content">{$_('leaderboard.subtitle')}</h2>
	<p class="text-sm text-base-content/60">{$_('leaderboard.description')}</p>

	<div class="flex flex-col gap-1.5">
		{#each data.leaderboard as row, i}
			{@const rank = i + 1}
			{@const isUser = row.locality === userLocality}
			{@const maxScore = leader?.total_sightings ?? 1}
			{@const barWidth = Math.round((row.total_sightings / maxScore) * 100)}
			<div
				class="flex items-center gap-3 rounded-xl border px-3.5 py-2.5"
				class:border-primary={isUser}
				class:bg-green-light={isUser}
				class:border-base-200={!isUser}
				class:bg-base-100={!isUser}
			>
				<span class="w-5 text-center text-base {rankStyles[rank] ?? 'text-base-content/40'}">
					{rank}
				</span>
				<div class="flex-1 min-w-0">
					<div class="text-sm font-medium text-base-content">
						{row.locality}
						{#if isUser}<span class="ml-1 text-[10px] text-primary">← you</span>{/if}
					</div>
					<div class="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-base-300">
						<div class="h-full rounded-full bg-primary" style="width: {barWidth}%"></div>
					</div>
				</div>
				<span class="shrink-0 text-xs font-medium text-primary">
					{row.total_sightings.toLocaleString()}
				</span>
			</div>
		{/each}
	</div>

	{#if userRow && leader && gap > 0}
		<div class="rounded-lg bg-green-light px-3 py-2.5 text-sm font-medium text-primary">
			{$_('leaderboard.gap', { values: { gap: gap.toLocaleString(), rival: leader.locality } })}
		</div>
	{/if}

	<button class="btn btn-primary w-full" onclick={() => goto('/observe')}>
		{$_('leaderboard.cta')}
	</button>
</div>
