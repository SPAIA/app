<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { directionsUrl, formatDistanceRange } from '$lib/geo';
	import type { Spot } from '$lib/types';
	import type { PageData } from './$types';

	export let data: PageData;

	type Phase = 'locating' | 'found' | 'none' | 'error';
	let phase: Phase = 'locating';
	let nearest: Spot | null = null;
	let distanceKm: number | null = null;
	let accuracy: number | null = null;

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let mapLibPromise: Promise<typeof import('maplibre-gl')> | null = null;
	let userMarker: import('maplibre-gl').Marker | null = null;
	let spotMarker: import('maplibre-gl').Marker | null = null;

	async function showOnMap(userLng: number, userLat: number, spot: Spot | null) {
		const mapLib = await mapLibPromise;
		const map = mapInstance;
		if (!mapLib || !map) return;

		const userEl = document.createElement('div');
		userEl.className = 'h-4 w-4 rounded-full border-2 border-white bg-primary shadow';
		userMarker?.remove();
		userMarker = new mapLib.Marker({ element: userEl }).setLngLat([userLng, userLat]).addTo(map);

		spotMarker?.remove();
		if (spot?.lng != null && spot?.lat != null) {
			const spotEl = document.createElement('div');
			spotEl.className =
				'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary text-sm';
			spotEl.textContent = spot.icon;
			spotMarker = new mapLib.Marker({ element: spotEl }).setLngLat([spot.lng, spot.lat]).addTo(map);

			const bounds = new mapLib.LngLatBounds();
			bounds.extend([userLng, userLat]);
			bounds.extend([spot.lng, spot.lat]);
			map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
		} else {
			map.flyTo({ center: [userLng, userLat], zoom: 14 });
		}
	}

	function locate() {
		phase = 'locating';

		if (!navigator.geolocation) {
			phase = 'error';
			return;
		}

		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				accuracy = pos.coords.accuracy;
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
					showOnMap(pos.coords.longitude, pos.coords.latitude, result.spot);
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

	onMount(() => {
		let cancelled = false;

		mapLibPromise = (async () => {
			const mapLib = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (cancelled) return mapLib;

			const styleUrl = data.stadiaApiKey
				? `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${data.stadiaApiKey}`
				: 'https://demotiles.maplibre.org/style.json';

			mapInstance = new mapLib.Map({
				container: mapContainer,
				style: styleUrl,
				center: [0, 20],
				zoom: 2
			});

			return mapLib;
		})();

		locate();

		return () => {
			cancelled = true;
			mapInstance?.remove();
		};
	});
</script>

<svelte:head>
	<title>{$_('observe.nearest.title')} — {$_('app.name')}</title>
</svelte:head>

<!-- Full-screen map, sized/centered to match the app's mobile column regardless of viewport width -->
<div class="fixed top-0 bottom-0 left-1/2 w-full max-w-105 -translate-x-1/2">
	<div bind:this={mapContainer} class="h-full w-full"></div>
</div>

<div class="fixed bottom-0 left-1/2 z-10 w-full max-w-105 -translate-x-1/2 rounded-t-2xl border-t border-base-300 bg-base-100 px-5 pt-6 pb-10">
	<div class="flex flex-col items-center gap-4 text-center">
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
			<button class="btn btn-ghost btn-sm w-full" onclick={() => goto('/spot-pack')}>
				{$_('observe.nearest.addSpot')}
			</button>
		{:else if phase === 'found' && nearest}
			<span class="text-4xl">{nearest.icon}</span>
			<div>
				<h2 class="text-xl font-medium text-base-content">{nearest.name}</h2>
				{#if distanceKm != null}
					<p class="mt-1 text-sm text-base-content/50">
						{$_('observe.nearest.distance', { values: { distance: formatDistanceRange(distanceKm, accuracy) } })}
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
			<button class="btn btn-ghost btn-sm w-full" onclick={() => goto('/spot-pack')}>
				{$_('observe.nearest.addSpot')}
			</button>
		{/if}
	</div>
</div>
