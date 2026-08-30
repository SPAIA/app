<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	function timeAgo(date: string): string {
		const isoDate = date.includes('T') ? date : date.replace(' ', 'T') + 'Z';
		const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
		if (seconds < 60) return $_('sightings.time.now');
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return $_('sightings.time.minutes', { values: { count: minutes } });
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return $_('sightings.time.hours', { values: { count: hours } });
		const days = Math.floor(hours / 24);
		return $_('sightings.time.days', { values: { count: days } });
	}
</script>

<svelte:head>
	<title>{$_('sightings.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	<p class="text-xs font-medium uppercase tracking-widest text-base-content/50">
		{$_('sightings.title')}
	</p>
	<h2 class="text-xl font-medium text-base-content">{$_('sightings.subtitle')}</h2>
	<p class="text-sm text-base-content/60">{$_('sightings.description')}</p>

	<div class="flex flex-col gap-1.5">
		{#each data.sightings as sighting}
			<div class="flex items-center gap-3 rounded-xl border border-base-200 bg-base-100 px-3.5 py-2.5">
				<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-200 text-lg">
					{sighting.icon ?? '🐞'}
				</span>
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm font-medium text-base-content">
						{sighting.insect_name}
					</div>
					<div class="truncate text-xs text-base-content/50">
						{sighting.space_name ?? sighting.locality ?? ''}
						· {timeAgo(sighting.tapped_at)}
					</div>
				</div>
				<span class="shrink-0 text-xs font-medium text-primary">
					+{sighting.count}
				</span>
			</div>
		{:else}
			<p class="py-8 text-center text-sm text-base-content/50">{$_('sightings.empty')}</p>
		{/each}
	</div>

	<button class="btn btn-primary w-full" onclick={() => goto('/observe')}>
		{$_('sightings.cta')}
	</button>
</div>
