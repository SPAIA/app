<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { enhance } from '$app/forms';
	import { onMount, onDestroy, tick } from 'svelte';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	interface AddressResult {
		label: string;
		locality: string | null;
		country: string | null;
		lat: number;
		lng: number;
	}

	let spotName = data.spot.name;
	let spotIcon = data.spot.icon;
	let lat: number | null = data.spot.lat;
	let lng: number | null = data.spot.lng;

	type LocationMode = 'search' | 'pin';
	let mode: LocationMode = 'pin';

	let searchText = '';
	let searchResults: AddressResult[] = [];
	let searching = false;
	let searchTimer: ReturnType<typeof setTimeout>;

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let markerInstance: import('maplibre-gl').Marker | null = null;
	let mapReady = false;

	let submitting = false;

	function applyLocation(newLat: number, newLng: number) {
		lat = newLat;
		lng = newLng;
		if (mapInstance && markerInstance) {
			markerInstance.setLngLat([newLng, newLat]);
			mapInstance.flyTo({ center: [newLng, newLat] });
		}
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
				const result = (await res.json()) as { results: AddressResult[] };
				searchResults = result.results;
			} finally {
				searching = false;
			}
		}, 300);
	}

	function pickSearchResult(r: AddressResult) {
		searchText = r.label;
		searchResults = [];
		mode = 'pin';
		applyLocation(r.lat, r.lng);
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

	onMount(async () => {
		await tick();
		initMap();
	});

	onDestroy(() => {
		mapInstance?.remove();
	});
</script>

<svelte:head>
	<title>{$_('spot.edit.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	<div>
		<h1 class="text-xl font-medium text-base-content">{$_('spot.edit.title')}</h1>
		<p class="text-xs text-base-content/50">{data.space.name}</p>
	</div>

	{#if form?.success}
		<div class="alert alert-success text-sm">{$_('spot.edit.saved')}</div>
	{/if}
	{#if form?.error}
		<div class="alert alert-error text-sm">{form.error}</div>
	{/if}

	<form method="POST" action="?/save" use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}} class="flex flex-col gap-4">
		<div class="flex gap-2">
			<label class="form-control w-16 shrink-0">
				<div class="label"><span class="label-text">{$_('spot.edit.icon.label')}</span></div>
				<input type="text" name="icon" class="input input-bordered w-full text-center text-lg" bind:value={spotIcon} maxlength="4" />
			</label>
			<label class="form-control flex-1">
				<div class="label"><span class="label-text">{$_('spot.edit.name.label')}</span></div>
				<input type="text" name="name" class="input input-bordered w-full" bind:value={spotName} />
			</label>
		</div>

		<div class="flex flex-col gap-2">
			<div class="label pb-0"><span class="label-text">{$_('space.new.location.label')}</span></div>

			<div class="flex gap-2">
				<button
					type="button"
					class="btn btn-sm flex-1"
					class:btn-primary={mode === 'search'}
					class:btn-outline={mode !== 'search'}
					onclick={() => (mode = 'search')}
				>
					{$_('space.new.location.search')}
				</button>
				<button
					type="button"
					class="btn btn-sm flex-1"
					class:btn-primary={mode === 'pin'}
					class:btn-outline={mode !== 'pin'}
					onclick={() => (mode = 'pin')}
				>
					{$_('space.new.location.pin')}
				</button>
			</div>

			{#if mode === 'search'}
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
						<ul class="absolute z-10 mt-1 w-full rounded-lg border border-base-300 bg-base-100 shadow-lg">
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
		</div>

		<input type="hidden" name="lat" value={lat ?? ''} />
		<input type="hidden" name="lng" value={lng ?? ''} />

		<button class="btn btn-primary w-full" disabled={submitting || !spotName}>
			{#if submitting}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$_('spot.edit.submit')}
		</button>
	</form>
</div>
