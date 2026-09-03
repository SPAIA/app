<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import { reverseGeocode } from '$lib/geocode';
	import SegmentedToggle from '$lib/components/SegmentedToggle.svelte';
	import { setBoundaryDraft, takeBoundaryResult } from '$lib/boundaryHandoff';
	import { formatArea } from '$lib/geo';
	import type { PageData } from './$types';

	export let data: PageData;

	interface AddressResult {
		label: string;
		locality: string | null;
		country: string | null;
		lat: number;
		lng: number;
	}

	let verified = false;
	let checking = true;
	let spaceOrderId = '';
	let spaceName = '';

	let locality: string | null = null;
	let country: string | null = null;
	let lat: number | null = null;
	let lng: number | null = null;
	let geocoding = false;

	type LocationMode = 'gps' | 'search' | 'pin';
	let mode: LocationMode = 'gps';
	let gpsStatus: 'idle' | 'locating' | 'found' | 'denied' = 'idle';

	let searchText = '';
	let searchResults: AddressResult[] = [];
	let searching = false;
	let searchTimer: ReturnType<typeof setTimeout>;

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let markerInstance: import('maplibre-gl').Marker | null = null;
	let mapReady = false;

	let boundary: string | null = null;
	let boundaryArea = 0;

	let submitting = false;
	let error = '';

	/** Reverse-geocodes lat/lng into full address data (locality, country). */
	async function applyLocation(newLat: number, newLng: number) {
		lat = newLat;
		lng = newLng;
		geocoding = true;
		try {
			const result = await reverseGeocode(newLat, newLng);
			locality = result?.locality ?? null;
			country = result?.country ?? null;
		} finally {
			geocoding = false;
		}

		if (mapInstance && markerInstance) {
			markerInstance.setLngLat([newLng, newLat]);
			mapInstance.flyTo({ center: [newLng, newLat] });
		}
	}

	function locateWithGps() {
		mode = 'gps';
		if (!navigator.geolocation) {
			gpsStatus = 'denied';
			return;
		}
		gpsStatus = 'locating';
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				gpsStatus = 'found';
				await applyLocation(pos.coords.latitude, pos.coords.longitude);
			},
			() => {
				gpsStatus = 'denied';
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	function onSearchInput() {
		clearTimeout(searchTimer);
		if (!searchText.trim()) {
			searchResults = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			searching = true;
			const params = new URLSearchParams({ text: searchText });
			if (lat != null && lng != null) {
				params.set('lat', String(lat));
				params.set('lng', String(lng));
			}
			try {
				const res = await fetch(`/api/geocode/search?${params}`);
				const data = (await res.json()) as { results: AddressResult[] };
				searchResults = data.results;
			} finally {
				searching = false;
			}
		}, 300);
	}

	async function pickSearchResult(r: AddressResult) {
		searchText = r.label;
		searchResults = [];
		await applyLocation(r.lat, r.lng);
	}

	function switchToPin() {
		mode = 'pin';
	}

	async function initMap() {
		if (mapReady) return;
		mapReady = true;

		const mapLib = await import('maplibre-gl');
		await import('maplibre-gl/dist/maplibre-gl.css');

		const styleUrl = data.stadiaApiKey
			? `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${data.stadiaApiKey}`
			: 'https://demotiles.maplibre.org/style.json';

		const center: [number, number] = lat != null && lng != null ? [lng, lat] : [0, 20];
		const zoom = lat != null && lng != null ? 14 : 2;

		const map = new mapLib.Map({ container: mapContainer, style: styleUrl, center, zoom });
		mapInstance = map;

		const marker = new mapLib.Marker({ draggable: true, color: '#0F6E56' })
			.setLngLat(center)
			.addTo(map);
		markerInstance = marker;

		marker.on('dragend', () => {
			mode = 'pin';
			const { lat: newLat, lng: newLng } = marker.getLngLat();
			applyLocation(newLat, newLng);
		});

		map.on('click', (e) => {
			mode = 'pin';
			marker.setLngLat(e.lngLat);
			applyLocation(e.lngLat.lat, e.lngLat.lng);
		});

		if (lat == null || lng == null) {
			await applyLocation(center[1], center[0]);
		}
	}

	function openBoundaryEditor() {
		setBoundaryDraft({ lat, lng, geojson: boundary, returnTo: $page.url.pathname + $page.url.search });
		goto('/space/boundary');
	}

	onMount(async () => {
		const boundaryResult = takeBoundaryResult();
		if (boundaryResult) {
			boundary = boundaryResult.geojson;
			boundaryArea = boundaryResult.areaM2;
		}

		if (boundaryResult?.lat != null && boundaryResult?.lng != null) {
			mode = 'pin';
			await applyLocation(boundaryResult.lat, boundaryResult.lng);
		} else {
			locateWithGps();
		}

		const sessionId = $page.url.searchParams.get('order');
		if (!sessionId) {
			goto('/space-pack');
			return;
		}

		const res = await fetch(`/api/stripe/verify?session_id=${sessionId}`);
		const data = (await res.json()) as { paid: boolean; spaceOrderId: string };
		if (!data.paid) {
			goto('/space-pack');
			return;
		}

		spaceOrderId = data.spaceOrderId;
		verified = true;
		checking = false;

		await tick();
		initMap();
	});

	onDestroy(() => {
		mapInstance?.remove();
	});

	async function handleCreate() {
		if (!spaceName) return;
		submitting = true;
		error = '';

		const res = await fetch('/api/space/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ spaceName, locality, country, lat, lng, spaceOrderId, boundaryGeojson: boundary })
		});

		if (!res.ok) {
			const d = (await res.json()) as { error?: string };
			error = d.error ?? 'Something went wrong.';
			submitting = false;
			return;
		}

		const data = (await res.json()) as { slug: string };
		goto(`/space/${data.slug}/dashboard`);
	}
</script>

<svelte:head>
	<title>{$_('space.new.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	{#if checking}
		<div class="flex items-center justify-center py-12">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if verified}
		<h1 class="text-xl font-medium text-base-content">{$_('space.new.title')}</h1>

		{#if error}
			<div class="alert alert-error text-sm">{error}</div>
		{/if}

		<label class="form-control">
			<div class="label"><span class="label-text">{$_('space.new.name.label')}</span></div>
			<input
				type="text"
				class="input input-bordered w-full"
				placeholder={$_('space.new.name.placeholder')}
				bind:value={spaceName}
			/>
		</label>

		<div class="flex flex-col gap-2">
			<div class="label pb-0"><span class="label-text">{$_('space.new.location.label')}</span></div>

			<SegmentedToggle
				value={mode}
				options={[
					{ value: 'gps', label: $_('space.new.location.gps'), onSelect: locateWithGps },
					{ value: 'search', label: $_('space.new.location.search'), onSelect: () => (mode = 'search') },
					{ value: 'pin', label: $_('space.new.location.pin'), onSelect: switchToPin }
				]}
			/>

			{#if mode === 'gps'}
				{#if gpsStatus === 'locating'}
					<p class="text-xs text-base-content/50">{$_('space.new.location.locating')}</p>
				{:else if gpsStatus === 'denied'}
					<p class="text-xs text-error">{$_('space.new.location.gps.error')}</p>
				{/if}
			{:else if mode === 'search'}
				<div class="relative">
					<input
						type="text"
						class="input input-bordered w-full"
						placeholder={$_('space.new.location.search.placeholder')}
						bind:value={searchText}
						oninput={onSearchInput}
					/>
					{#if searching}
						<span class="loading loading-spinner loading-xs absolute right-3 top-3"></span>
					{/if}
					{#if searchResults.length > 0}
						<ul class="absolute z-10 mt-1 w-full rounded-lg border border-base-300 bg-base-100">
							{#each searchResults as r}
								<li>
									<button
										type="button"
										class="w-full px-3 py-2 text-left text-sm hover:bg-green-light"
										onclick={() => pickSearchResult(r)}
									>
										{r.label}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else if mode === 'pin'}
				<p class="text-xs text-base-content/50">{$_('space.new.location.pin.hint')}</p>
			{/if}

			<div bind:this={mapContainer} class="h-40 w-full overflow-hidden rounded-xl border border-base-300"></div>

			{#if geocoding}
				<p class="text-xs text-base-content/50">{$_('space.new.location.resolving')}</p>
			{:else if locality}
				<p class="text-xs text-base-content/50">📍 {locality}{country ? `, ${country}` : ''}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-2">
			<div class="label pb-0"><span class="label-text">{$_('space.new.boundary.label')}</span></div>
			{#if boundary}
				<div class="flex items-center justify-between gap-2 rounded-xl border border-base-300 px-4 py-3">
					<span class="text-sm text-base-content/70">{formatArea(boundaryArea)}</span>
					<div class="flex gap-2">
						<button type="button" class="btn btn-ghost btn-sm" onclick={openBoundaryEditor}>
							{$_('space.new.boundary.edit')}
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm text-error"
							onclick={() => {
								boundary = null;
								boundaryArea = 0;
							}}
						>
							{$_('space.new.boundary.clear')}
						</button>
					</div>
				</div>
			{:else}
				<button type="button" class="btn btn-outline w-full" onclick={openBoundaryEditor}>
					{$_('space.new.boundary.draw')}
				</button>
			{/if}
		</div>

		<button
			class="btn btn-primary w-full mt-2"
			onclick={handleCreate}
			disabled={submitting || !spaceName}
		>
			{#if submitting}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$_('space.new.submit')}
		</button>
	{/if}
</div>
