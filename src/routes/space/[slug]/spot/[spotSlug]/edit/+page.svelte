<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy, tick } from 'svelte';
	import SegmentedToggle from '$lib/components/SegmentedToggle.svelte';
	import type { PageData, ActionData } from './$types';
	import type { Media, SpotVisionResult } from '$lib/types';

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

	let cover: Media | null = data.cover;
	let coverPreview = cover ? `/api/media/${cover.id}` : '';
	let coverUploading = false;
	let coverError = '';
	let coverInput: HTMLInputElement;
	let coverVision: SpotVisionResult | null = null;

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

		const center: [number, number] = lat != null && lng != null ? [lng, lat] : [0, 20];
		const zoom = lat != null && lng != null ? 15 : 2;

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

	onMount(async () => {
		await tick();
		initMap();
	});

	onDestroy(() => {
		mapInstance?.remove();
	});

	// Uploads via the spot's photo endpoint (not the generic /api/media one) so
	// the new cover also runs through DeepSeek Vision, which records habitat
	// features and plant observations for this spot and may rename it.
	async function handleCoverChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		coverUploading = true;
		coverError = '';
		coverVision = null;
		coverPreview = URL.createObjectURL(file);

		const body = new FormData();
		body.append('file', file);

		const res = await fetch(`/api/spot/${data.spot.id}/photo`, { method: 'POST', body });

		if (!res.ok) {
			const detail = await res.json().catch(() => ({ message: 'Upload failed' }));
			coverError = detail.message ?? 'Upload failed';
			coverUploading = false;
			return;
		}

		const result = (await res.json()) as {
			media: { id: string; url: string };
			spot: { id: number; slug: string; name: string };
			vision: SpotVisionResult | null;
		};

		const previous = cover;
		cover = { id: result.media.id } as Media;
		coverPreview = result.media.url;
		coverUploading = false;
		coverVision = result.vision;

		if (previous) {
			await fetch(`/api/media/${previous.id}`, { method: 'DELETE' });
		}

		if (result.spot.slug !== data.spot.slug) {
			await goto(`/space/${data.space.slug}/spot/${result.spot.slug}/edit`, { invalidateAll: true });
			return;
		}

		if (result.vision) {
			spotName = result.spot.name;
		}
	}
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

	<!-- Cover image -->
	<div class="flex flex-col gap-2">
		<div class="label pb-0"><span class="label-text">{$_('spot.edit.cover.label')}</span></div>
		<div class="relative">
			<div class="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-base-200 ring-1 ring-base-300">
				{#if coverPreview}
					<img src={coverPreview} alt="" class="h-full w-full object-cover" />
				{:else}
					<span class="text-3xl">{spotIcon}</span>
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
		{#if coverVision?.scene}
			<p class="text-xs text-base-content/50">{coverVision.scene}</p>
		{/if}
		<button
			type="button"
			class="btn btn-ghost btn-sm self-start text-primary"
			onclick={() => coverInput.click()}
			disabled={coverUploading}
		>
			{$_('spot.edit.cover.change')}
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

			<SegmentedToggle
				value={mode}
				options={[
					{ value: 'search', label: $_('space.new.location.search'), onSelect: () => (mode = 'search') },
					{ value: 'pin', label: $_('space.new.location.pin'), onSelect: () => (mode = 'pin') }
				]}
			/>

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
		</div>

		<input type="hidden" name="lat" value={lat ?? ''} />
		<input type="hidden" name="lng" value={lng ?? ''} />

		<button class="btn btn-primary w-full" disabled={submitting || !spotName}>
			{#if submitting}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$_('spot.edit.submit')}
		</button>
	</form>
</div>
