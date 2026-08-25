<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { directionsUrl, formatDistanceKm } from '$lib/geo';
	import type { Spot } from '$lib/types';

	type Phase = 'locating' | 'found' | 'none' | 'error';
	let phase: Phase = 'locating';
	let nearest: Spot | null = null;
	let distanceKm: number | null = null;

	function locate() {
		phase = 'locating';

		if (!navigator.geolocation) {
			phase = 'error';
			return;
		}

		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				try {
					const res = await fetch(`/api/spot/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
					const result = (await res.json()) as { spot: Spot | null; distanceKm: number | null };
					if (result.spot) {
						nearest = result.spot;
						distanceKm = result.distanceKm;
						phase = 'found';
					} else {
						phase = 'none';
					}
				} catch {
					phase = 'error';
				}
			},
			() => {
				phase = 'error';
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	onMount(locate);
</script>

<svelte:head>
	<title>{$_('observe.nearest.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col items-center gap-4 px-5 py-10 text-center">
	<h1 class="text-lg font-medium text-base-content">{$_('observe.nearest.title')}</h1>

	{#if phase === 'locating'}
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<p class="text-sm text-base-content/50">{$_('observe.nearest.locating')}</p>
	{:else if phase === 'error'}
		<p class="text-sm text-error">{$_('observe.nearest.error')}</p>
		<button class="btn btn-primary w-full" onclick={locate}>{$_('observe.nearest.retry')}</button>
	{:else if phase === 'none'}
		<p class="text-sm text-base-content/50">{$_('observe.nearest.none')}</p>
		<button class="btn btn-outline w-full" onclick={locate}>{$_('observe.nearest.retry')}</button>
	{:else if phase === 'found' && nearest}
		<span class="text-4xl">{nearest.icon}</span>
		<div>
			<h2 class="text-xl font-medium text-base-content">{nearest.name}</h2>
			{#if distanceKm != null}
				<p class="mt-1 text-sm text-base-content/50">
					{$_('observe.nearest.distance', { values: { distance: formatDistanceKm(distanceKm) } })}
				</p>
			{/if}
		</div>

		<button class="btn btn-primary w-full" onclick={() => goto(`/observe/${nearest!.slug}`)}>
			{$_('observe.nearest.cta')}
		</button>
		{#if nearest.lat != null && nearest.lng != null}
			<a
				class="btn btn-outline w-full"
				href={directionsUrl(nearest.lat, nearest.lng)}
				target="_blank"
				rel="noopener noreferrer"
			>
				{$_('observe.nearest.directions')}
			</a>
		{/if}
	{/if}
</div>
