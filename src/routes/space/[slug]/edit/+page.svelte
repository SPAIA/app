<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import area from '@turf/area';
	import { reverseGeocode } from '$lib/geocode';
	import SegmentedToggle from '$lib/components/SegmentedToggle.svelte';
	import { setBoundaryDraft, takeBoundaryResult } from '$lib/boundaryHandoff';
	import { formatArea } from '$lib/geo';
	import type { PageData, ActionData } from './$types';
	import type { Media } from '$lib/types';

	export let data: PageData;
	export let form: ActionData;

	interface AddressResult {
		label: string;
		locality: string | null;
		country: string | null;
		lat: number;
		lng: number;
	}

	let spaceName = data.space.name;
	let locality: string | null = data.space.locality;
	let country: string | null = data.space.country;
	let lat: number | null = data.space.lat;
	let lng: number | null = data.space.lng;
	let geocoding = false;

	let boundary: string | null = data.space.boundary_geojson;
	let boundaryArea = boundary ? area(JSON.parse(boundary)) : 0;

	type LocationMode = 'gps' | 'search' | 'pin';
	let mode: LocationMode = 'pin';
	let gpsStatus: 'idle' | 'locating' | 'found' | 'denied' = 'idle';

	let searchText = '';
	let searchResults: AddressResult[] = [];
	let searching = false;
	let searchTimer: ReturnType<typeof setTimeout>;

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let markerInstance: import('maplibre-gl').Marker | null = null;
	let mapReady = false;

	let submitting = false;

	let cover: Media | null = data.cover;
	let coverPreview = cover ? `/api/media/${cover.id}` : '';
	let coverUploading = false;
	let coverError = '';
	let coverInput: HTMLInputElement;

	/** Reverse-geocodes lat/lng into full address data (locality, country). */
	async function applyLocation(newLat: number, newLng: number) {
		lat = newLat;
		lng = newLng;
		geocoding = true;
		try {
			const result = await reverseGeocode(newLat, newLng);
			locality = result?.locality ?? locality;
			country = result?.country ?? country;
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
		mode = 'pin';
		await applyLocation(r.lat, r.lng);
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
	}

	function openBoundaryEditor() {
		setBoundaryDraft({ lat, lng, geojson: boundary, returnTo: $page.url.pathname });
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
		}

		await tick();
		initMap();
	});

	onDestroy(() => {
		mapInstance?.remove();
	});

	async function handleCoverChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		coverUploading = true;
		coverError = '';
		coverPreview = URL.createObjectURL(file);

		const body = new FormData();
		body.append('file', file);
		body.append('entity_type', 'space');
		body.append('entity_id', String(data.space.id));
		body.append('media_type', 'header_image');

		const res = await fetch('/api/media', { method: 'POST', body });

		if (!res.ok) {
			const detail = await res.json().catch(() => ({ message: 'Upload failed' }));
			coverError = detail.message ?? 'Upload failed';
			coverUploading = false;
			return;
		}

		const { id, url } = (await res.json()) as { id: string; url: string };

		const previous = cover;
		cover = { id } as Media;
		coverPreview = url;
		coverUploading = false;

		if (previous) {
			await fetch(`/api/media/${previous.id}`, { method: 'DELETE' });
		}
	}
</script>

<svelte:head>
	<title>{$_('space.edit.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	<h1 class="text-xl font-medium text-base-content">{$_('space.edit.title')}</h1>

	{#if form?.success}
		<div class="alert alert-success text-sm">{$_('space.edit.saved')}</div>
	{/if}
	{#if form?.error}
		<div class="alert alert-error text-sm">{form.error}</div>
	{/if}

	<!-- Cover image -->
	<div class="flex flex-col gap-2">
		<div class="label pb-0"><span class="label-text">{$_('space.edit.cover.label')}</span></div>
		<div class="relative">
			<div class="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-base-200 ring-1 ring-base-300">
				{#if coverPreview}
					<img src={coverPreview} alt="" class="h-full w-full object-cover" />
				{:else}
					<span class="text-3xl">{data.space.icon}</span>
				{/if}
			</div>
			{#if coverUploading}
				<div class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
					<span class="loading loading-spinner loading-sm text-white"></span>
				</div>
			{/if}
		</div>
		{#if coverError}
			<p class="text-xs text-error">{coverError}</p>
		{/if}
		<button
			type="button"
			class="btn btn-ghost btn-sm self-start text-primary"
			onclick={() => coverInput.click()}
			disabled={coverUploading}
		>
			{$_('space.edit.cover.change')}
		</button>
		<input
			bind:this={coverInput}
			type="file"
			accept="image/*"
			class="sr-only"
			onchange={handleCoverChange}
		/>
	</div>

	<form method="POST" action="?/save" use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}} class="flex flex-col gap-4">
		<label class="form-control">
			<div class="label"><span class="label-text">{$_('space.new.name.label')}</span></div>
			<input
				type="text"
				name="name"
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
					{ value: 'pin', label: $_('space.new.location.pin'), onSelect: () => (mode = 'pin') }
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

		<input type="hidden" name="locality" value={locality ?? ''} />
		<input type="hidden" name="country" value={country ?? ''} />
		<input type="hidden" name="lat" value={lat ?? ''} />
		<input type="hidden" name="lng" value={lng ?? ''} />
		<input type="hidden" name="boundary_geojson" value={boundary ?? ''} />

		<button class="btn btn-primary w-full" disabled={submitting || !spaceName}>
			{#if submitting}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$_('space.edit.submit')}
		</button>
	</form>
</div>
