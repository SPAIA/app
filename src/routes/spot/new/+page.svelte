<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import { reverseGeocode } from '$lib/geocode';
	import { formatDistanceKm } from '$lib/geo';
	import { resizeImageFile } from '$lib/media/resizeImage';
	import SegmentedToggle from '$lib/components/SegmentedToggle.svelte';
	import ChipListEditor from '$lib/components/ChipListEditor.svelte';
	import type { SpotVisionResult } from '$lib/types';
	import type { PageData } from './$types';

	export let data: PageData;

	let verified = false;
	let checking = true;
	let orderId = '';

	type Phase = 'location' | 'photo' | 'analyzing' | 'confirm' | 'done';
	let phase: Phase = 'location';

	type LocationMode = 'gps' | 'pin';
	let mode: LocationMode = 'gps';
	let gpsStatus: 'idle' | 'acquiring' | 'found' | 'error' = 'idle';
	let lat: number | null = null;
	let lng: number | null = null;
	let accuracy: number | null = null;
	let locality: string | null = null;
	let country: string | null = null;
	let town: string | null = null;
	let region: string | null = null;
	let postcode: string | null = null;
	let countryGeonameId: number | null = null;
	let regionGeonameId: number | null = null;
	let townGeonameId: number | null = null;
	let localityGeonameId: number | null = null;
	let geocoding = false;

	let spaceSlug = '';

	const SATELLITE_SOURCE_ID = 'spot-new-satellite';
	const SATELLITE_LAYER_ID = 'spot-new-satellite-layer';

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let markerInstance: import('maplibre-gl').Marker | null = null;
	let mapReady = false;
	let basemap: 'streets' | 'satellite' = 'streets';

	let spotId: number | null = null;
	let spotSlug = '';
	let spotName = '';
	let photoUrl: string | null = null;
	let mediaId: string | null = null;
	let vision: SpotVisionResult | null = null;
	let sceneDescription = '';
	let editablePlants: SpotVisionResult['plants'] = [];
	let editableFeatures: SpotVisionResult['habitat_features'] = [];
	let fileInput: HTMLInputElement;

	let creatingSpot = false;
	let error = '';

	async function applyLocation(newLat: number, newLng: number, zoom?: number) {
		lat = newLat;
		lng = newLng;
		geocoding = true;
		try {
			const result = await reverseGeocode(newLat, newLng);
			locality = result?.locality ?? null;
			country = result?.country ?? null;
			town = result?.town ?? null;
			region = result?.region ?? null;
			postcode = result?.postcode ?? null;
			countryGeonameId = result?.countryGeonameId ?? null;
			regionGeonameId = result?.regionGeonameId ?? null;
			townGeonameId = result?.townGeonameId ?? null;
			localityGeonameId = result?.localityGeonameId ?? null;
		} finally {
			geocoding = false;
		}

		if (mapInstance && markerInstance) {
			markerInstance.setLngLat([newLng, newLat]);
			mapInstance.flyTo({ center: [newLng, newLat], ...(zoom != null ? { zoom } : {}) });
		}
	}

	function locateWithGps() {
		mode = 'gps';
		if (!navigator.geolocation) {
			gpsStatus = 'error';
			return;
		}
		gpsStatus = 'acquiring';
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				gpsStatus = 'found';
				accuracy = pos.coords.accuracy;
				await applyLocation(pos.coords.latitude, pos.coords.longitude, 18);
			},
			() => {
				gpsStatus = 'error';
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	function toggleBasemap() {
		basemap = basemap === 'streets' ? 'satellite' : 'streets';
		mapInstance?.setLayoutProperty(
			SATELLITE_LAYER_ID,
			'visibility',
			basemap === 'satellite' ? 'visible' : 'none'
		);
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
		const zoom = lat != null && lng != null ? 18 : 2;

		const map = new mapLib.Map({ container: mapContainer, style: styleUrl, center, zoom });
		mapInstance = map;

		const marker = new mapLib.Marker({ draggable: true, color: '#0F6E56' }).setLngLat(center).addTo(map);
		markerInstance = marker;

		marker.on('dragend', () => {
			mode = 'pin';
			accuracy = null;
			const { lat: newLat, lng: newLng } = marker.getLngLat();
			applyLocation(newLat, newLng);
		});

		map.on('click', (e) => {
			mode = 'pin';
			accuracy = null;
			marker.setLngLat(e.lngLat);
			applyLocation(e.lngLat.lat, e.lngLat.lng);
		});

		map.on('load', () => {
			map.addSource(SATELLITE_SOURCE_ID, {
				type: 'raster',
				tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
				tileSize: 256,
				maxzoom: 23,
				attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
			});
			map.addLayer({
				id: SATELLITE_LAYER_ID,
				type: 'raster',
				source: SATELLITE_SOURCE_ID,
				layout: { visibility: 'none' }
			});
		});
	}

	async function handleContinue() {
		if (lat == null || lng == null) return;
		error = '';
		creatingSpot = true;

		try {
			const res = await fetch('/api/spot', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lat,
					lng,
					order_id: orderId,
					locality,
					country,
					town,
					region,
					postcode,
					countryGeonameId,
					regionGeonameId,
					townGeonameId,
					localityGeonameId
				})
			});
			if (!res.ok) {
				const d = (await res.json()) as { error?: string };
				error = d.error ?? $_('spot.buy.error.generic');
				return;
			}
			const spotData = (await res.json()) as { id: number; slug: string; space_slug: string };
			spotId = spotData.id;
			spotSlug = spotData.slug;
			spaceSlug = spotData.space_slug;
			phase = 'photo';
		} catch {
			error = $_('spot.buy.error.generic');
		} finally {
			creatingSpot = false;
		}
	}

	function openFilePicker() {
		fileInput?.click();
	}

	async function onFileSelected(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file || spotId == null) return;

		phase = 'analyzing';
		error = '';

		const resized = await resizeImageFile(file);

		const form = new FormData();
		form.append('file', resized);
		if (locality) form.append('locality', locality);

		try {
			const res = await fetch(`/api/spot/${spotId}/photo`, { method: 'POST', body: form });
			if (!res.ok) throw new Error('upload failed');
			const result = (await res.json()) as {
				media: { id: string; url: string };
				spot: { slug: string; name: string };
				vision: SpotVisionResult | null;
			};
			photoUrl = result.media.url;
			mediaId = result.media.id;
			vision = result.vision;
			spotSlug = result.spot.slug;
			spotName = result.spot.name;
			if (vision) {
				sceneDescription = vision.scene;
				editablePlants = [...vision.plants];
				editableFeatures = [...vision.habitat_features];
			}
		} catch {
			error = $_('spot.buy.error.generic');
		} finally {
			phase = 'confirm';
		}
	}

	function skipPhoto() {
		phase = 'confirm';
	}

	function removePlant(index: number) {
		editablePlants = editablePlants.filter((_, i) => i !== index);
	}

	function addPlant(name: string) {
		editablePlants = [...editablePlants, { name, rank: 'type' }];
	}

	function removeFeature(index: number) {
		editableFeatures = editableFeatures.filter((_, i) => i !== index);
	}

	function addFeature(label: string) {
		editableFeatures = [...editableFeatures, { category: 'other', label }];
	}

	async function confirmSpot() {
		const finalName = spotName.trim() || $_('spot.add.confirm.name.default');
		spotName = finalName;

		if (spotId != null) {
			try {
				const res = await fetch(`/api/spot/${spotId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: finalName })
				});
				if (res.ok) {
					const d = (await res.json()) as { slug: string };
					spotSlug = d.slug;
				}
			} catch {
				// non-blocking — the placeholder/AI name still stands server-side
			}
		}

		if (spotId != null && mediaId != null) {
			try {
				await fetch(`/api/spot/${spotId}/vision`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ mediaId, plants: editablePlants, habitat_features: editableFeatures })
				});
			} catch {
				// non-blocking — the AI-guessed plants/features still stand server-side
			}
		}

		phase = 'done';
	}

	function startObserving() {
		goto(`/observe/${spotSlug}`);
	}

	onMount(async () => {
		const sessionId = $page.url.searchParams.get('order');
		if (!sessionId) {
			goto('/space-pack');
			return;
		}

		const res = await fetch(`/api/stripe/verify?session_id=${sessionId}`);
		const verifyData = (await res.json()) as { paid: boolean; spaceOrderId: string };
		if (!verifyData.paid) {
			goto('/space-pack');
			return;
		}

		orderId = verifyData.spaceOrderId;
		verified = true;
		checking = false;

		await tick();
		locateWithGps();
		initMap();
	});

	onDestroy(() => {
		mapInstance?.remove();
	});
</script>

<svelte:head>
	<title>{$_('spot.buy.title')} — {$_('app.name')}</title>
</svelte:head>

{#if checking}
	<div class="flex items-center justify-center py-12">
		<span class="loading loading-spinner loading-lg text-primary"></span>
	</div>
{:else if verified}
	{#if phase === 'location'}
		<div class="absolute inset-0 flex flex-col">
			<div class="absolute inset-0">
				<div bind:this={mapContainer} class="h-full w-full"></div>
			</div>

			<div
				class="relative z-10 flex flex-col gap-2 bg-gradient-to-b from-base-100/95 to-transparent px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)]"
			>
				<div class="flex items-center justify-between gap-2">
					<h1 class="text-xl font-medium text-base-content">{$_('spot.buy.title')}</h1>
					<button type="button" class="btn btn-sm btn-outline bg-base-100" onclick={toggleBasemap}>
						{basemap === 'satellite' ? $_('spot.add.location.map') : $_('spot.add.location.satellite')}
					</button>
				</div>
				{#if error}
					<div class="alert alert-error text-sm">{error}</div>
				{/if}
			</div>

			<div
				class="relative z-10 mt-auto flex flex-col gap-3 rounded-t-2xl border-t border-base-300 bg-base-100 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
			>
				<div>
					<p class="mb-2 text-xs font-medium uppercase tracking-widest text-base-content/50">
						{$_('spot.add.location.label')}
					</p>

					<SegmentedToggle
						value={mode}
						options={[
							{ value: 'gps', label: $_('spot.add.location.gps'), onSelect: locateWithGps },
							{ value: 'pin', label: $_('spot.add.location.pin'), onSelect: () => (mode = 'pin') }
						]}
					/>

					{#if mode === 'gps'}
						{#if gpsStatus === 'acquiring'}
							<p class="mt-2 text-xs text-base-content/50">{$_('spot.add.location.locating')}</p>
						{:else if gpsStatus === 'error'}
							<p class="mt-2 text-xs text-error">{$_('spot.add.location.gps.error')}</p>
						{/if}
					{:else}
						<p class="mt-2 text-xs text-base-content/50">{$_('spot.add.location.pin.hint')}</p>
					{/if}

					{#if geocoding}
						<p class="mt-2 text-xs text-base-content/50">{$_('spot.add.location.resolving')}</p>
					{:else if locality}
						<p class="mt-2 text-xs text-base-content/50">📍 {locality}</p>
					{/if}
					{#if mode === 'gps' && accuracy != null}
						<p class="mt-1 text-xs text-base-content/40">
							{$_('spot.add.location.accuracy', { values: { range: formatDistanceKm(accuracy / 1000) } })}
						</p>
					{/if}
				</div>

				<button
					class="btn btn-primary w-full"
					onclick={handleContinue}
					disabled={lat == null || lng == null || creatingSpot}
				>
					{#if creatingSpot}<span class="loading loading-spinner loading-sm"></span>{/if}
					{$_('spot.add.location.continue')}
				</button>
			</div>
		</div>
	{:else if phase === 'photo'}
		<div class="flex flex-col items-center gap-4 px-5 py-10 text-center">
			<span class="text-4xl">📷</span>
			<div>
				<p class="text-base font-medium text-base-content">{$_('spot.add.photo.label')}</p>
				<p class="mt-1 text-sm text-base-content/50">{$_('spot.add.photo.hint')}</p>
			</div>

			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				capture="environment"
				class="sr-only"
				onchange={onFileSelected}
			/>

			<button class="btn btn-primary w-full" onclick={openFilePicker}>
				{$_('spot.add.photo.cta')}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={skipPhoto}>
				{$_('spot.add.photo.skip')}
			</button>
		</div>
	{:else if phase === 'analyzing'}
		<div class="flex flex-col items-center gap-4 px-5 py-16 text-center">
			<span class="loading loading-spinner loading-lg text-primary"></span>
			<p class="text-sm text-base-content/50">{$_('spot.add.analyzing')}</p>
		</div>
	{:else if phase === 'confirm'}
		<div class="flex flex-col gap-4 px-5 py-6">
			{#if photoUrl}
				<img src={photoUrl} alt="" class="h-40 w-full rounded-xl object-cover" />
				<p class="-mt-2 text-xs text-base-content/50">{$_('spot.add.photo.cover_note')}</p>
			{/if}

			{#if error}
				<div class="alert alert-error text-sm">{error}</div>
			{/if}

			<label class="form-control">
				<div class="label"><span class="label-text">{$_('spot.add.confirm.name.label')}</span></div>
				<input
					type="text"
					class="input input-bordered w-full"
					placeholder={$_('spot.add.confirm.name.default')}
					bind:value={spotName}
				/>
			</label>

			{#if vision}
				{#if vision.scene}
					<label class="form-control">
						<div class="label">
							<span class="label-text text-xs font-medium uppercase tracking-widest text-base-content/50">
								{$_('spot.add.confirm.scene.label')}
							</span>
						</div>
						<textarea class="textarea textarea-bordered w-full text-sm" rows="2" bind:value={sceneDescription}
						></textarea>
					</label>
				{/if}

				<div>
					<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-base-content/50">
						{$_('spot.add.confirm.plants.label')}
					</p>
					<ChipListEditor
						items={editablePlants.map((p) => p.name)}
						addPlaceholder={$_('spot.add.confirm.plants.addPlaceholder')}
						removeLabel={$_('spot.add.confirm.remove')}
						chipClass="bg-green-light text-primary"
						chipRemoveClass="text-primary/60 hover:text-primary"
						onAdd={addPlant}
						onRemove={removePlant}
					/>
				</div>

				<div>
					<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-base-content/50">
						{$_('spot.add.confirm.habitat_features.label')}
					</p>
					<ChipListEditor
						items={editableFeatures.map((f) => f.label)}
						addPlaceholder={$_('spot.add.confirm.habitat_features.addPlaceholder')}
						removeLabel={$_('spot.add.confirm.remove')}
						onAdd={addFeature}
						onRemove={removeFeature}
					/>
				</div>
			{/if}

			<button class="btn btn-primary w-full" onclick={confirmSpot} disabled={!spotName.trim()}>
				{$_('spot.add.confirm.cta')}
			</button>
		</div>
	{:else if phase === 'done'}
		<div class="flex flex-col items-center gap-4 px-5 py-16 text-center">
			<span class="text-4xl">🎉</span>
			<h1 class="text-xl font-medium text-base-content">{spotName}</h1>
			<p class="text-sm text-base-content/50">{$_('spot.buy.done.subtitle')}</p>

			<p class="mt-2 text-sm font-medium text-base-content">{$_('spot.buy.done.observe.prompt')}</p>
			<button class="btn btn-primary w-full" onclick={startObserving}>
				{$_('spot.buy.done.observe.cta')}
			</button>

			<a class="btn btn-outline btn-sm w-full" href={`/space/${spaceSlug}/spot/${spotSlug}/edit`}>
				{$_('spot.buy.done.manage')}
			</a>
			<button class="btn btn-ghost btn-sm w-full" onclick={() => goto('/explore')}>
				{$_('spot.buy.done.explore')}
			</button>
		</div>
	{/if}
{/if}
