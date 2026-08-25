<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import { reverseGeocodeLocality } from '$lib/geocode';
	import { resizeImageFile } from '$lib/media/resizeImage';
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
	let locality: string | null = null;
	let geocoding = false;

	let spaceId: number | null = null;
	let spaceSlug = '';

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let markerInstance: import('maplibre-gl').Marker | null = null;
	let mapReady = false;

	let spotId: number | null = null;
	let spotSlug = '';
	let spotName = '';
	let photoUrl: string | null = null;
	let vision: SpotVisionResult | null = null;
	let fileInput: HTMLInputElement;

	let creatingSpot = false;
	let error = '';

	async function applyLocation(newLat: number, newLng: number) {
		lat = newLat;
		lng = newLng;
		geocoding = true;
		try {
			locality = await reverseGeocodeLocality(newLat, newLng);
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
			gpsStatus = 'error';
			return;
		}
		gpsStatus = 'acquiring';
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				gpsStatus = 'found';
				await applyLocation(pos.coords.latitude, pos.coords.longitude);
			},
			() => {
				gpsStatus = 'error';
			},
			{ enableHighAccuracy: true, timeout: 10000 }
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

		const center: [number, number] = lat != null && lng != null ? [lng, lat] : [13.38, 52.52];

		const map = new mapLib.Map({ container: mapContainer, style: styleUrl, center, zoom: 15 });
		mapInstance = map;

		const marker = new mapLib.Marker({ draggable: true, color: '#0F6E56' }).setLngLat(center).addTo(map);
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

	async function handleContinue() {
		if (lat == null || lng == null) return;
		error = '';
		creatingSpot = true;

		try {
			// Spots still nest under a space for now (Spaces get a real
			// map-boundary redesign later) — attach to whichever's nearest.
			const nearestRes = await fetch(`/api/space/nearest?lat=${lat}&lng=${lng}`);
			const nearest = (await nearestRes.json()) as { space: { id: number; slug: string; name: string } | null };
			if (!nearest.space) {
				error = $_('spot.buy.error.no_space');
				return;
			}
			spaceId = nearest.space.id;
			spaceSlug = nearest.space.slug;

			const res = await fetch('/api/spot', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ space_id: spaceId, lat, lng, order_id: orderId })
			});
			if (!res.ok) {
				const d = (await res.json()) as { error?: string };
				error = d.error ?? $_('spot.buy.error.generic');
				return;
			}
			const spotData = (await res.json()) as { id: number; slug: string };
			spotId = spotData.id;
			spotSlug = spotData.slug;
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
				media: { url: string };
				spot: { slug: string; name: string };
				vision: SpotVisionResult | null;
			};
			photoUrl = result.media.url;
			vision = result.vision;
			spotSlug = result.spot.slug;
			spotName = result.spot.name;
		} catch {
			error = $_('spot.buy.error.generic');
		} finally {
			phase = 'confirm';
		}
	}

	function skipPhoto() {
		phase = 'confirm';
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
		<div class="flex flex-col gap-4 px-5 py-6">
			<h1 class="text-xl font-medium text-base-content">{$_('spot.buy.title')}</h1>

			{#if error}
				<div class="alert alert-error text-sm">{error}</div>
			{/if}

			<div>
				<p class="mb-2 text-xs font-medium uppercase tracking-widest text-base-content/50">
					{$_('spot.add.location.label')}
				</p>

				<div class="flex gap-2">
					<button
						class="btn btn-sm flex-1"
						class:btn-primary={mode === 'gps'}
						class:btn-outline={mode !== 'gps'}
						onclick={locateWithGps}
					>
						{$_('spot.add.location.gps')}
					</button>
					<button
						class="btn btn-sm flex-1"
						class:btn-primary={mode === 'pin'}
						class:btn-outline={mode !== 'pin'}
						onclick={() => (mode = 'pin')}
					>
						{$_('spot.add.location.pin')}
					</button>
				</div>

				{#if mode === 'gps'}
					{#if gpsStatus === 'acquiring'}
						<p class="mt-2 text-xs text-base-content/50">{$_('spot.add.location.locating')}</p>
					{:else if gpsStatus === 'error'}
						<p class="mt-2 text-xs text-error">{$_('spot.add.location.gps.error')}</p>
					{/if}
				{:else}
					<p class="mt-2 text-xs text-base-content/50">{$_('spot.add.location.pin.hint')}</p>
				{/if}

				<div bind:this={mapContainer} class="mt-2 h-40 w-full overflow-hidden rounded-xl border border-base-300"></div>

				{#if geocoding}
					<p class="mt-2 text-xs text-base-content/50">{$_('spot.add.location.resolving')}</p>
				{:else if locality}
					<p class="mt-2 text-xs text-base-content/50">📍 {locality}</p>
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
				class="hidden"
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
					<p class="text-sm text-base-content/70">{vision.scene}</p>
				{/if}
				{#if vision.plants.length}
					<div>
						<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-base-content/50">
							{$_('spot.add.confirm.plants.label')}
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#each vision.plants as plant}
								<span class="rounded-full bg-green-light px-2.5 py-1 text-xs text-primary">{plant.name}</span>
							{/each}
						</div>
					</div>
				{/if}
				{#if vision.habitat_features.length}
					<div>
						<p class="mb-1.5 text-xs font-medium uppercase tracking-widest text-base-content/50">
							{$_('spot.add.confirm.habitat_features.label')}
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#each vision.habitat_features as feature}
								<span class="rounded-full bg-base-200 px-2.5 py-1 text-xs text-base-content/70">{feature.label}</span>
							{/each}
						</div>
					</div>
				{/if}
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
