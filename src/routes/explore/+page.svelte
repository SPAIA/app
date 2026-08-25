<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { Spot } from '$lib/types';
	import type { SpotSummary } from '$lib/db/queries';

	export let data: PageData;

	type MapSpot = Spot & { space_name: string };

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let selectedSpot: MapSpot | null = null;
	let summary: (SpotSummary & { cover: { id: string } | null }) | null = null;
	let summaryLoading = false;
	let locating = false;
	let locateError = false;

	// SQLite's datetime('now') comes back space-separated with no zone; it's UTC.
	function formatDate(sqliteDatetime: string) {
		const iso = sqliteDatetime.includes('T') ? sqliteDatetime : `${sqliteDatetime.replace(' ', 'T')}Z`;
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	async function selectSpot(spot: MapSpot) {
		selectedSpot = spot;
		summary = null;
		summaryLoading = true;
		try {
			const res = await fetch(`/api/spot/${spot.id}/summary`);
			summary = await res.json();
		} finally {
			summaryLoading = false;
		}
	}

	function closeCard() {
		selectedSpot = null;
		summary = null;
	}

	function startObserving() {
		if (!selectedSpot) return;
		goto(`/observe/${selectedSpot.slug}`);
	}

	function findNearestSpot() {
		if (!navigator.geolocation) {
			locateError = true;
			return;
		}

		locating = true;
		locateError = false;

		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				try {
					const res = await fetch(
						`/api/spot/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
					);
					const result = (await res.json()) as { spot: Spot | null; distanceKm: number | null };
					if (result.spot) {
						const spot = data.spots.find((s) => s.id === result.spot!.id) ?? (result.spot as MapSpot);
						mapInstance?.flyTo({ center: [spot.lng!, spot.lat!], zoom: 15 });
						selectSpot(spot as MapSpot);
					} else {
						locateError = true;
					}
				} catch {
					locateError = true;
				} finally {
					locating = false;
				}
			},
			() => {
				locating = false;
				locateError = true;
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	onMount(() => {
		let cancelled = false;

		(async () => {
			const mapLib = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (cancelled) return;

			const styleUrl = data.stadiaApiKey
				? `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${data.stadiaApiKey}`
				: 'https://demotiles.maplibre.org/style.json';

			const map = new mapLib.Map({
				container: mapContainer,
				style: styleUrl,
				center: [13.38, 52.52],
				zoom: 12
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
						'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#0F6E56] text-sm shadow-md';
					el.textContent = spot.icon;
					el.onclick = () => selectSpot(spot);
					new mapLib.Marker({ element: el }).setLngLat([spot.lng, spot.lat]).addTo(map);
				}

				if (hasSpots) map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
			});
		})();

		return () => {
			cancelled = true;
			mapInstance?.remove();
		};
	});
</script>

<svelte:head>
	<title>{$_('explore.title')} — {$_('app.name')}</title>
</svelte:head>

<!-- Full-screen map, sized/centered to match the app's mobile column regardless of viewport width -->
<div class="fixed top-0 bottom-0 left-1/2 w-full max-w-105 -translate-x-1/2">
	<div bind:this={mapContainer} class="h-full w-full"></div>

	<div class="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-2">
		<span class="pointer-events-auto rounded-full bg-base-100/90 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-base-content/70 shadow-md backdrop-blur">
			{$_('explore.title')}
		</span>
		<button
			class="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-100/90 text-primary shadow-md backdrop-blur disabled:opacity-50"
			disabled={locating}
			aria-label={$_('explore.nearMe.cta')}
			onclick={findNearestSpot}
		>
			{#if locating}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
					<path fill-rule="evenodd" d="M12 1.5a.75.75 0 0 1 .75.75V4.5a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 12 1.5ZM5.636 4.136a.75.75 0 0 1 1.06 0l1.592 1.591a.75.75 0 0 1-1.061 1.06L5.636 5.197a.75.75 0 0 1 0-1.06Zm12.728 0a.75.75 0 0 1 0 1.06l-1.591 1.592a.75.75 0 0 1-1.06-1.061l1.591-1.591a.75.75 0 0 1 1.06 0Zm-8.99 8.99a2.625 2.625 0 1 1 3.712-3.713 2.625 2.625 0 0 1-3.713 3.712ZM12 6.375a5.625 5.625 0 1 0 0 11.25 5.625 5.625 0 0 0 0-11.25ZM2.25 12a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Zm16.5 0a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 0 1.5H19.5a.75.75 0 0 1-.75-.75ZM6.727 16.712a.75.75 0 0 1 0 1.06l-1.591 1.592a.75.75 0 1 1-1.06-1.061l1.591-1.591a.75.75 0 0 1 1.06 0Zm10.546 0a.75.75 0 0 1 1.06 0l1.592 1.591a.75.75 0 1 1-1.061 1.06l-1.591-1.591a.75.75 0 0 1 0-1.06ZM12 19.5a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0v-2.25a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd"/>
				</svg>
			{/if}
		</button>
	</div>

	{#if locateError}
		<p class="pointer-events-none absolute inset-x-4 top-16 rounded-lg bg-error/90 px-3 py-1.5 text-center text-xs text-white shadow-md">
			{$_('explore.nearMe.error')}
		</p>
	{/if}

	{#if !selectedSpot}
		<button class="absolute inset-x-4 bottom-24 z-10 btn btn-outline btn-sm w-full bg-base-100/90 shadow-md backdrop-blur" onclick={() => goto('/space-pack')}>
			{$_('explore.cta.space')}
		</button>
	{/if}
</div>

<!-- Spot detail bottom sheet -->
{#if selectedSpot}
	<button class="fixed inset-0 z-40 w-full bg-black/40" aria-label={$_('explore.spot.close')} onclick={closeCard}></button>
	<div class="fixed bottom-0 left-1/2 z-50 max-h-[80vh] w-full max-w-105 -translate-x-1/2 overflow-y-auto rounded-t-2xl bg-base-100 shadow-xl">
		{#if summary?.cover}
			<img src="/api/media/{summary.cover.id}" alt="" class="h-40 w-full rounded-t-2xl object-cover" />
		{/if}
		<div class="flex flex-col gap-2 p-5">
			<div class="mb-2 flex items-center gap-3">
				<span class="text-2xl">{selectedSpot.icon}</span>
				<h3 class="text-lg font-medium text-base-content">{selectedSpot.name}</h3>
			</div>

			{#if summaryLoading}
				<div class="flex justify-center py-6">
					<span class="loading loading-spinner loading-sm"></span>
				</div>
			{:else if summary}
				{#if summary.observationCount === 0}
					<p class="mb-2 text-sm text-base-content/50">{$_('explore.spot.noObservations')}</p>
				{:else}
					<div class="mb-2 rounded-xl border border-base-300 bg-base-200 py-3 text-center">
						<div class="text-2xl font-medium text-primary">{summary.observationCount}</div>
						<div class="mt-0.5 text-[10px] text-base-content/50">
							{$_('explore.spot.observations', { values: { count: summary.observationCount } })}
						</div>
					</div>

					{#if summary.lastObservedAt}
						<p class="mb-2 text-xs text-base-content/50">
							{$_('explore.spot.lastObserved', { values: { date: formatDate(summary.lastObservedAt) } })}
						</p>
					{/if}

					{#if summary.topInsects.length}
						<div class="mb-2">
							<p class="mb-2 text-[10px] font-medium uppercase tracking-widest text-base-content/50">
								{$_('explore.spot.topInsects')}
							</p>
							<div class="flex flex-col gap-1.5">
								{#each summary.topInsects as insect}
									<div class="flex items-center justify-between rounded-lg bg-base-200 px-3 py-2">
										<span class="flex items-center gap-2 text-sm text-base-content">
											{#if insect.icon}<span>{insect.icon}</span>{/if}
											{insect.name}
										</span>
										<span class="text-xs font-medium text-base-content/50">{insect.count}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			{/if}

			<button class="btn btn-primary w-full" onclick={startObserving}>
				{$_('space.cta.observe')}
			</button>
			<button class="btn btn-ghost btn-sm w-full" onclick={closeCard}>
				{$_('explore.spot.close')}
			</button>
		</div>
	</div>
{/if}
