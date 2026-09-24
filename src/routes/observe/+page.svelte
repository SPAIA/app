<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { directionsUrl, findNearestSpots, formatDistanceKm, formatDistanceRange, haversineKm } from '$lib/geo';
	import type { Spot, SpotVisionResult } from '$lib/types';
	import type { SpotSummary } from '$lib/server/db/spots';
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Drawer from '$lib/components/ui/drawer';

	export let data: PageData;

	type MapSpot = Spot & { space_name: string };

	type Phase = 'locating' | 'located' | 'error';
	let phase: Phase = 'locating';
	let accuracy: number | null = null;
	let userLat: number | null = null;
	let userLng: number | null = null;

	let open = false;
	let sheetView: 'list' | 'detail' = 'list';
	let selectedSpot: MapSpot | null = null;
	let selectedDistanceKm: number | null = null;
	let summary: (SpotSummary & { cover: { id: string } | null }) | null = null;
	let summaryLoading = false;

	let nearbySpots: { spot: MapSpot; distanceKm: number }[] = [];
	let nearestSpot: MapSpot | null = null;
	let nearestDistanceKm: number | null = null;
	let showProximityModal = false;
	const NEW_SPOT_PROXIMITY_KM = 0.1;

	$: isNearest = selectedSpot != null && nearestSpot != null && selectedSpot.id === nearestSpot.id;

	// ai_description stores the full cached DeepSeek Vision read as JSON — pull out just the scene text.
	function sceneFromDescription(aiDescription: string): string | null {
		try {
			return (JSON.parse(aiDescription) as SpotVisionResult).scene || null;
		} catch {
			return null;
		}
	}
	$: selectedScene = selectedSpot?.ai_description ? sceneFromDescription(selectedSpot.ai_description) : null;

	// SQLite's datetime('now') comes back space-separated with no zone; it's UTC.
	function formatDate(sqliteDatetime: string) {
		const iso = sqliteDatetime.includes('T') ? sqliteDatetime : `${sqliteDatetime.replace(' ', 'T')}Z`;
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

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
		sheetView = 'detail';
		open = true;
		summary = null;
		selectedDistanceKm =
			userLat != null && userLng != null && spot.lat != null && spot.lng != null
				? haversineKm(userLat, userLng, spot.lat, spot.lng)
				: null;

		summaryLoading = true;
		try {
			const res = await fetch(`/api/spot/${spot.id}/summary`);
			summary = (await res.json()) as SpotSummary & { cover: { id: string } | null };
		} finally {
			summaryLoading = false;
		}
	}

	function showNearbyList() {
		sheetView = 'list';
	}

	function closeCard() {
		open = false;
	}

	function handleCreateSpot() {
		if (nearestDistanceKm != null && nearestDistanceKm < NEW_SPOT_PROXIMITY_KM) {
			showProximityModal = true;
		} else {
			goto('/spot-pack');
		}
	}

	function confirmCreateSpot() {
		showProximityModal = false;
		goto('/spot-pack');
	}

	async function centerOnUser(lat: number, lng: number, nearest: MapSpot | null) {
		const mapLib = await mapLibPromise;
		const map = mapInstance;
		if (!mapLib || !map) return;

		centeredOnUser = true;

		if (nearest?.lat != null && nearest?.lng != null) {
			// Fit both the user and their nearest spot in view rather than just the user,
			// since finding that spot is the point of this screen.
			const bounds = new mapLib.LngLatBounds([lng, lat], [lng, lat]);
			bounds.extend([nearest.lng, nearest.lat]);
			map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
		} else {
			map.flyTo({ center: [lng, lat], zoom: 16 });
		}

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

				nearbySpots = findNearestSpots(data.spots as MapSpot[], userLat, userLng, 2) as {
					spot: MapSpot;
					distanceKm: number;
				}[];
				nearestSpot = nearbySpots[0]?.spot ?? null;
				nearestDistanceKm = nearbySpots[0]?.distanceKm ?? null;
				centerOnUser(userLat, userLng, nearestSpot);
				if (nearbySpots.length) {
					sheetView = 'list';
					open = true;
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
			<span class="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
				<Spinner size="xs" />
				{$_('observe.nearest.locating')}
			</span>
		</div>
	{:else if phase === 'error'}
		<div class="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-center gap-2">
			<span class="pointer-events-auto rounded-full bg-destructive px-3 py-1.5 text-center text-xs text-white">
				{$_('observe.nearest.error')}
			</span>
			<Button variant="outline" size="xs" class="pointer-events-auto bg-background" onclick={locate}>
				{$_('observe.nearest.retry')}
			</Button>
		</div>
	{/if}

	{#if !open}
		{#if data.spots.length === 0}
			<p class="pointer-events-none absolute inset-x-4 bottom-36 text-center text-xs text-muted-foreground">
				{$_('observe.nearest.none')}
			</p>
		{/if}
		<Button variant="outline" size="sm" class="absolute inset-x-4 bottom-24 z-10 bg-background" onclick={() => goto('/spot-pack')}>
			{$_('observe.nearest.addSpot')}
		</Button>
	{/if}
</div>

<!-- Nearby spots / spot detail drawer -->
<Drawer.Root bind:open>
	<Drawer.Content>
		{#if sheetView === 'list'}
			<Drawer.Header>
				<Drawer.Title class="text-lg font-medium">{$_('observe.nearest.listHeading')}</Drawer.Title>
			</Drawer.Header>

			<div class="flex flex-col gap-2 px-4 pb-2">
				{#each nearbySpots as { spot, distanceKm } (spot.id)}
					<button
						type="button"
						class="flex w-full items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2.5 text-left"
						onclick={() => selectSpot(spot)}
					>
						<span class="text-2xl">{spot.icon}</span>
						<span class="flex-1">
							<span class="block text-sm font-medium text-foreground">{spot.name}</span>
							<span class="block text-xs text-muted-foreground">
								{$_('observe.nearest.distance', { values: { distance: formatDistanceRange(distanceKm, accuracy) } })}
							</span>
						</span>
					</button>
				{:else}
					<p class="py-2 text-center text-xs text-muted-foreground">{$_('observe.nearest.none')}</p>
				{/each}
			</div>

			<Drawer.Footer>
				<Button variant="outline" class="w-full" onclick={handleCreateSpot}>
					{$_('observe.nearest.addSpot')}
				</Button>
				<Button variant="ghost" size="sm" class="w-full" onclick={closeCard}>
					{$_('explore.spot.close')}
				</Button>
			</Drawer.Footer>
		{:else if selectedSpot}
			{#if summaryLoading}
				<div class="flex h-40 w-full items-center justify-center">
					<Spinner size="sm" />
				</div>
			{:else if summary?.cover}
				<img src="/api/media/{summary.cover.id}" alt="" class="mb-2 h-40 w-full rounded-2xl object-cover" />
			{/if}

			{#if nearbySpots.length > 1}
				<button type="button" class="px-4 pt-2 text-left text-xs text-muted-foreground" onclick={showNearbyList}>
					← {$_('observe.nearest.back')}
				</button>
			{/if}

			<Drawer.Header>
				<div class="text-4xl">{selectedSpot.icon}</div>
				{#if isNearest}
					<Drawer.Description>{$_('observe.nearest.heading')}</Drawer.Description>
				{/if}
				<Drawer.Title class="text-xl font-medium">{selectedSpot.name}</Drawer.Title>
				{#if selectedDistanceKm != null}
					<Drawer.Description>
						{$_('observe.nearest.distance', { values: { distance: formatDistanceRange(selectedDistanceKm, accuracy) } })}
					</Drawer.Description>
				{/if}
			</Drawer.Header>

			<div class="flex flex-col gap-2 overflow-y-auto px-4 pb-2">
				{#if selectedScene}
					<p class="text-sm text-muted-foreground">{selectedScene}</p>
				{/if}
				{#if !summaryLoading}
					{#if summary?.lastObservedAt}
						<p class="text-xs text-muted-foreground">
							{$_('explore.spot.lastObserved', { values: { date: formatDate(summary.lastObservedAt) } })}
						</p>
					{:else if summary}
						<p class="text-xs text-muted-foreground">{$_('explore.spot.noObservations')}</p>
					{/if}
				{/if}
			</div>

			<Drawer.Footer>
				<Button variant="default" class="w-full" onclick={() => goto(`/observe/${selectedSpot!.slug}`)}>
					{$_('observe.nearest.cta', { values: { name: selectedSpot.name } })}
				</Button>
				{#if selectedSpot.lat != null && selectedSpot.lng != null}
					<Button
						variant="outline"
						class="w-full"
						href={directionsUrl(selectedSpot.lat, selectedSpot.lng)}
						target="_blank"
						rel="noopener noreferrer"
					>
						{$_('observe.nearest.directions')}
					</Button>
				{/if}
				<Button variant="ghost" size="sm" class="w-full" onclick={closeCard}>
					{$_('explore.spot.close')}
				</Button>
			</Drawer.Footer>
		{/if}
	</Drawer.Content>
</Drawer.Root>

{#if showProximityModal}
	<div class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 px-5 pointer-events-auto">
		<div class="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-background p-5 text-center shadow-xl">
			<span class="text-3xl">📍</span>
			<p class="text-sm text-foreground">
				{$_('observe.nearest.newSpot.warning', {
					values: { distance: nearestDistanceKm != null ? formatDistanceKm(nearestDistanceKm) : '?' }
				})}
			</p>
			<Button variant="default" class="w-full" onclick={confirmCreateSpot}>
				{$_('observe.nearest.newSpot.confirm')}
			</Button>
			<Button variant="ghost" size="sm" onclick={() => (showProximityModal = false)}>
				{$_('observe.nearest.newSpot.cancel')}
			</Button>
		</div>
	</div>
{/if}
