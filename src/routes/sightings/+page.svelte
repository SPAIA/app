<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';

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
	<p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
		{$_('sightings.title')}
	</p>
	<h2 class="text-xl font-medium text-foreground">{$_('sightings.subtitle')}</h2>
	<p class="text-sm text-muted-foreground">{$_('sightings.description')}</p>

	<div class="flex flex-col gap-1.5">
		{#each data.sightings as sighting}
			<div class="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5">
				<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
					{sighting.icon ?? '🐞'}
				</span>
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm font-medium text-foreground">
						{sighting.insect_name}
					</div>
					<div class="truncate text-xs text-muted-foreground">
						{sighting.space_name ?? sighting.locality ?? ''}
						· {timeAgo(sighting.tapped_at)}
					</div>
				</div>
				<span class="shrink-0 text-xs font-medium text-primary">
					+{sighting.count}
				</span>
			</div>
		{:else}
			<p class="py-8 text-center text-sm text-muted-foreground">{$_('sightings.empty')}</p>
		{/each}
	</div>

	<Button variant="default" class="w-full" onclick={() => goto('/observe')}>
		{$_('sightings.cta')}
	</Button>
</div>
