<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>{data.space.name} — {$_('app.name')}</title>
</svelte:head>

{#if data.cover}
	<img src="/api/media/{data.cover.id}" alt="" class="h-40 w-full object-cover" />
{/if}

<div class="flex flex-col gap-4 px-5 py-6">
	<div class="flex items-center gap-3">
		<span class="text-3xl">{data.space.icon}</span>
		<div>
			<h1 class="text-xl font-medium text-foreground">{data.space.name}</h1>
			<p class="text-sm text-muted-foreground">{data.space.locality}</p>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-2">
		<div class="rounded-xl border border-border bg-muted py-3 text-center">
			<div class="text-2xl font-medium text-primary">{data.live.totalThisWeek}</div>
			<div class="mt-0.5 text-[10px] text-muted-foreground">{$_('space.sightings.week')}</div>
		</div>
		{#if data.live.lastInsect}
			<div class="rounded-xl border border-border bg-muted px-3 py-3 text-center">
				<div class="text-sm font-medium text-foreground">{data.live.lastInsect}</div>
				<div class="mt-0.5 text-[10px] text-muted-foreground">{$_('space.recent')}</div>
			</div>
		{/if}
	</div>

	<Button variant="default" class="w-full" onclick={() => goto('/observe')}>
		{$_('space.cta.observe')}
	</Button>
</div>
