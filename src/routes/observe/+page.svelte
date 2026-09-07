<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { directionsUrl, formatDistanceRange, haversineKm } from '$lib/geo';
	import type { Spot } from '$lib/types';
	import type { SpotSummary } from '$lib/db/queries';
	import type { PageData } from './$types';

	export let data: PageData;

	type MapSpot = Spot & { space_name: string };

	type Phase = 'locating' | 'located' | 'error';
	let phase: Phase = 'locating';
	let accuracy: number | null = null;
	let userLat: number | null = null;
	let userLng: number | null = null;

	let selectedSpot: MapSpot | null = null;
	let selectedDistanceKm: number | null = null;
	let cover: { id: string } | null = null;
	let coverLoading = false;

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let mapLibPromise: Promise<typeof import('maplibre-gl')> | null = null;
	let userMarker: import('maplibre-gl').Marker | null = null;
	// Guards against the map's 'load' handler (which fits bounds to all spots
	// as a starting view) clobbering a flyTo that already landed on the user,
	// since geolocation can resolve before or after the map finishes loading.
	let centeredOnUser = false;

	async function selectSpot(spot: MapSpot) {
		selectedSpot = spot;
		cover = null;
		selectedDistanceKm =
			userLat != null && userLng != null && spot.lat != null && spot.lng != null
				? haversineKm(userLat, userLng, spot.lat, spot.lng)
				: null;

		coverLoading = true;
		try {
			const res = await fetch(`/api/spot/${spot.id}/summary`);
			const result = (await res.json()) as SpotSummary & { cover: { id: string } | null };
			cover = result.cover;
		} finally {
			coverLoading = false;
		}
	}

	function closeCard() {
		selectedSpot = null;
		cover = null;
	}

	async function centerOnUser(lat: number, lng: number) {
		const mapLib = await mapLibPromise;
		const map = mapInstance;
		if (!mapLib || !map) return;

		centeredOnUser = true;
		map.flyTo({ center: [lng, lat], zoom: 14 });

		const el = document.createElement('div');
		el.className = 'h-4 w-4 rounded-full border-2 border-white bg-primary shadow';
		userMarker?.remove();
		userMarker = new mapLib.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
	}

	function locate() {
		phase = 'locating';

		if (!navigator.geolocation) {
			phase = 'error';
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(pos) => {
				userLat = pos.coords.latitude;
				userLng = pos.coords.longitude;
				accuracy = pos.coords.accuracy;
				phase = 'located';
				centerOnUser(userLat, userLng);
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

			const map = new mapLib.Map({
				container: mapContainer,
				style: styleUrl,
				center: [0, 20],
				zoom: 2
			});
			mapInstance = map;

			map.on('load', () => {
				const bounds = new mapLib.LngLatBounds();
				let hasSpots = false;

				for (const spot of data.spots as MapSpot[]) {
					if (spot.lat == null || spot.lng == null) continue;
					hasSpots = true;
					bounds.extend([spot.lng, spot.lat]);

					const el = document.createElement('div');
					el.className =
						'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-primary text-sm';
					el.textContent = spot.icon;
					el.onclick = () => selectSpot(spot);
					new mapLib.Marker({ element: el }).setLngLat([spot.lng, spot.lat]).addTo(map);
				}

				// Sane starting view before we know where the user is — skipped if
				// geolocation already centered on the user by the time tiles loaded.
				if (hasSpots && !centeredOnUser) map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
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

	{#if phase === 'locating'}
		<div class="pointer-events-none absolute inset-x-4 top-4 flex justify-center">
			<span class="pointer-events-auto flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs text-base-content/70">
				<span class="loading loading-spinner loading-xs"></span>
				{$_('observe.nearest.locating')}
			</span>
		</div>
	{:else if phase === 'error'}
		<div class="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-center gap-2">
			<span class="pointer-events-auto rounded-full bg-error px-3 py-1.5 text-center text-xs text-white">
				{$_('observe.nearest.error')}
			</span>
			<button class="pointer-events-auto btn btn-outline btn-xs bg-base-100" onclick={locate}>
				{$_('observe.nearest.retry')}
			</button>
		</div>
	{/if}

	{#if !selectedSpot}
		{#if data.spots.length === 0}
			<p class="pointer-events-none absolute inset-x-4 bottom-36 text-center text-xs text-base-content/70">
				{$_('observe.nearest.none')}
			</p>
		{/if}
		<button class="absolute inset-x-4 bottom-24 z-10 btn btn-outline btn-sm bg-base-100" onclick={() => goto('/spot-pack')}>
			{$_('observe.nearest.addSpot')}
		</button>
	{/if}
</div>

<!-- Spot detail bottom sheet -->
{#if selectedSpot}
	<button class="fixed inset-0 z-40 w-full bg-black/40" aria-label={$_('explore.spot.close')} onclick={closeCard}></button>
	<div class="fixed bottom-0 left-1/2 z-50 max-h-[80vh] w-full max-w-105 -translate-x-1/2 overflow-y-auto rounded-t-2xl border-t border-base-300 bg-base-100">
		{#if coverLoading}
			<div class="flex h-40 w-full items-center justify-center">
				<span class="loading loading-spinner loading-sm"></span>
			</div>
		{:else if cover}
			<img src="/api/media/{cover.id}" alt="" class="h-40 w-full rounded-t-2xl object-cover" />
		{/if}
		<div class="flex flex-col items-center gap-4 p-5 text-center">
			<span class="text-4xl">{selectedSpot.icon}</span>
			<div>
				<h2 class="text-xl font-medium text-base-content">{selectedSpot.name}</h2>
				{#if selectedDistanceKm != null}
					<p class="mt-1 text-sm text-base-content/50">
						{$_('observe.nearest.distance', { values: { distance: formatDistanceRange(selectedDistanceKm, accuracy) } })}
					</p>
				{/if}
			</div>

			<button class="btn btn-primary w-full" onclick={() => goto(`/observe/${selectedSpot!.slug}`)}>
				{$_('observe.nearest.cta')}
			</button>
			{#if selectedSpot.lat != null && selectedSpot.lng != null}
				<a
					class="btn btn-outline w-full"
					href={directionsUrl(selectedSpot.lat, selectedSpot.lng)}
					target="_blank"
					rel="noopener noreferrer"
				>
					{$_('observe.nearest.directions')}
				</a>
			{/if}
			<button class="btn btn-ghost btn-sm w-full" onclick={closeCard}>
				{$_('explore.spot.close')}
			</button>
		</div>
	</div>
{/if}
