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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert';
	import { Spinner } from '$lib/components/ui/spinner';
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
	let town: string | null = data.space.town;
	let region: string | null = data.space.region;
	let postcode: string | null = data.space.postcode;
	let countryGeonameId: number | null = data.space.country_geoname_id;
	let regionGeonameId: number | null = data.space.region_geoname_id;
	let townGeonameId: number | null = data.space.town_geoname_id;
	let localityGeonameId: number | null = data.space.locality_geoname_id;
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
			town = result?.town ?? town;
			region = result?.region ?? region;
			postcode = result?.postcode ?? postcode;
			countryGeonameId = result?.countryGeonameId ?? countryGeonameId;
			regionGeonameId = result?.regionGeonameId ?? regionGeonameId;
			townGeonameId = result?.townGeonameId ?? townGeonameId;
			localityGeonameId = result?.localityGeonameId ?? localityGeonameId;
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
	<h1 class="text-xl font-medium text-foreground">{$_('space.edit.title')}</h1>

	{#if form?.success}
		<Alert.Root class="text-sm border-primary/30 bg-primary/10 text-primary">{$_('space.edit.saved')}</Alert.Root>
	{/if}
	{#if form?.error}
		<Alert.Root variant="destructive" class="text-sm">{form.error}</Alert.Root>
	{/if}

	<!-- Cover image -->
	<div class="flex flex-col gap-2">
		<Label>{$_('space.edit.cover.label')}</Label>
		<div class="relative">
			<div class="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
				{#if coverPreview}
					<img src={coverPreview} alt="" class="h-full w-full object-cover" />
				{:else}
					<span class="text-3xl">{data.space.icon}</span>
				{/if}
			</div>
			{#if coverUploading}
				<div class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
					<Spinner size="sm" class="text-white" />
				</div>
			{/if}
		</div>
		{#if coverError}
			<p class="text-xs text-destructive">{coverError}</p>
		{/if}
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="self-start text-primary"
			onclick={() => coverInput.click()}
			disabled={coverUploading}
		>
			{$_('space.edit.cover.change')}
		</Button>
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
		<div class="flex flex-col gap-1.5">
			<Label>{$_('space.new.name.label')}</Label>
			<Input
				type="text"
				name="name"
				placeholder={$_('space.new.name.placeholder')}
				bind:value={spaceName}
			/>
		</div>

		<div class="flex flex-col gap-2">
			<Label>{$_('space.new.location.label')}</Label>

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
					<p class="text-xs text-muted-foreground">{$_('space.new.location.locating')}</p>
				{:else if gpsStatus === 'denied'}
					<p class="text-xs text-destructive">{$_('space.new.location.gps.error')}</p>
				{/if}
			{:else if mode === 'search'}
				<div class="relative">
					<Input
						type="text"
						placeholder={$_('space.new.location.search.placeholder')}
						bind:value={searchText}
						oninput={onSearchInput}
					/>
					{#if searching}
						<Spinner size="xs" class="absolute right-3 top-3" />
					{/if}
					{#if searchResults.length > 0}
						<ul class="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background">
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
				<p class="text-xs text-muted-foreground">{$_('space.new.location.pin.hint')}</p>
			{/if}

			<div bind:this={mapContainer} class="h-40 w-full overflow-hidden rounded-xl border border-border"></div>

			{#if geocoding}
				<p class="text-xs text-muted-foreground">{$_('space.new.location.resolving')}</p>
			{:else if locality}
				<p class="text-xs text-muted-foreground">📍 {locality}{country ? `, ${country}` : ''}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-2">
			<Label>{$_('space.new.boundary.label')}</Label>
			{#if boundary}
				<div class="flex items-center justify-between gap-2 rounded-xl border border-border px-4 py-3">
					<span class="text-sm text-muted-foreground">{formatArea(boundaryArea)}</span>
					<div class="flex gap-2">
						<Button type="button" variant="ghost" size="sm" onclick={openBoundaryEditor}>
							{$_('space.new.boundary.edit')}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="text-destructive"
							onclick={() => {
								boundary = null;
								boundaryArea = 0;
							}}
						>
							{$_('space.new.boundary.clear')}
						</Button>
					</div>
				</div>
			{:else}
				<Button type="button" variant="outline" class="w-full" onclick={openBoundaryEditor}>
					{$_('space.new.boundary.draw')}
				</Button>
			{/if}
		</div>

		<input type="hidden" name="locality" value={locality ?? ''} />
		<input type="hidden" name="country" value={country ?? ''} />
		<input type="hidden" name="town" value={town ?? ''} />
		<input type="hidden" name="region" value={region ?? ''} />
		<input type="hidden" name="postcode" value={postcode ?? ''} />
		<input type="hidden" name="country_geoname_id" value={countryGeonameId ?? ''} />
		<input type="hidden" name="region_geoname_id" value={regionGeonameId ?? ''} />
		<input type="hidden" name="town_geoname_id" value={townGeonameId ?? ''} />
		<input type="hidden" name="locality_geoname_id" value={localityGeonameId ?? ''} />
		<input type="hidden" name="lat" value={lat ?? ''} />
		<input type="hidden" name="lng" value={lng ?? ''} />
		<input type="hidden" name="boundary_geojson" value={boundary ?? ''} />

		<Button variant="default" class="w-full" disabled={submitting || !spaceName}>
			{#if submitting}<Spinner size="sm" />{/if}
			{$_('space.edit.submit')}
		</Button>
	</form>
</div>
