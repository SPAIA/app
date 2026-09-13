<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>{data.space.name} {$_('space.dashboard.title')} — {$_('app.name')}</title>
</svelte:head>

{#if data.cover}
	<img src="/api/media/{data.cover.id}" alt="" class="h-32 w-full object-cover" />
{/if}

<div class="flex flex-col gap-4 px-5 py-6">
	<div class="flex items-center gap-3">
		<span class="text-2xl">{data.space.icon}</span>
		<div class="flex-1">
			<h1 class="text-lg font-medium text-foreground">{data.space.name}</h1>
			<p class="text-xs text-muted-foreground">{$_('space.dashboard.title')}</p>
		</div>
		<Button variant="outline" size="sm" href="/space/{data.space.slug}/edit">
			{$_('space.dashboard.edit')}
		</Button>
	</div>

	<div class="grid grid-cols-3 gap-2">
		<div class="rounded-xl border border-border bg-muted py-3 text-center">
			<div class="text-xl font-medium text-primary">{data.sessions.length}</div>
			<div class="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{$_('space.dashboard.sessions')}</div>
		</div>
		<div class="rounded-xl border border-border bg-muted py-3 text-center">
			<div class="text-xl font-medium text-primary">{data.totalSightings}</div>
			<div class="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{$_('space.dashboard.sightings')}</div>
		</div>
		<div class="rounded-xl border border-border bg-muted py-3 text-center">
			<div class="text-xl font-medium text-primary">{data.uniqueObservers}</div>
			<div class="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{$_('space.dashboard.observers')}</div>
		</div>
	</div>

	<h2 class="text-sm font-medium text-foreground">{$_('space.dashboard.recent')}</h2>

	<div class="flex flex-col gap-2">
		{#each data.sessions.slice(0, 10) as session}
			<div class="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
				<div>
					<p class="text-sm text-foreground">{session.weather ?? '—'}</p>
					<p class="text-[10px] text-muted-foreground">{session.completed_at?.split('T')[0] ?? ''}</p>
				</div>
				<span class="text-sm font-medium text-primary">{session.total_count} sightings</span>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No sessions yet.</p>
		{/each}
	</div>
</div>
