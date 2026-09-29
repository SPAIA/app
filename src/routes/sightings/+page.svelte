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

	<div class="flex flex-col gap-2">
		{#each data.sessions as session (session.id)}
			<button
				type="button"
				class="flex w-full items-center overflow-hidden rounded-xl border border-border bg-muted text-left"
				onclick={() => goto(`/share/${session.id}`)}
			>
				<!-- The fixed square sets the row height; one-line text keeps the row from outgrowing it -->
				<span class="size-20 shrink-0 bg-border">
					{#if session.image_id}
						<img src="/api/media/{session.image_id}" alt="" loading="lazy" class="h-full w-full object-cover" />
					{/if}
				</span>
				<span class="flex min-w-0 flex-1 flex-col justify-center px-3">
					<span class="block truncate text-sm font-medium text-foreground">
						{session.spot_name ?? session.space_name ?? session.locality ?? ''}
					</span>
					<span class="block truncate text-xs text-muted-foreground">
						{$_('sightings.session.counts', {
							values: { count: session.total_count, species: session.species_count }
						})}
					</span>
					<span class="block truncate text-xs text-muted-foreground">
						{timeAgo(session.completed_at)}
					</span>
				</span>
			</button>
		{:else}
			<p class="py-8 text-center text-sm text-muted-foreground">{$_('sightings.empty')}</p>
		{/each}
	</div>

	<Button variant="default" class="w-full" onclick={() => goto('/observe')}>
		{$_('sightings.cta')}
	</Button>
</div>
