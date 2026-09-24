<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import SegmentedToggle from '$lib/components/SegmentedToggle.svelte';
	import { downloadSpotSign } from '$lib/sign';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert';
	import { Spinner } from '$lib/components/ui/spinner';
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
	let signDownloading = false;

	async function handleDownloadSign() {
		signDownloading = true;
		try {
			await downloadSpotSign(data.spot.slug, $page.url.origin);
		} finally {
			signDownloading = false;
		}
	}

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

		const marker = new mapLib.Marker({ draggable: true, color: '#1B9468' })
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
		<h1 class="text-xl font-medium text-foreground">{$_('spot.edit.title')}</h1>
		<p class="text-xs text-muted-foreground">{data.space.name}</p>
	</div>

	{#if form?.success}
		<Alert.Root class="text-sm border-primary/30 bg-primary/10 text-primary">{$_('spot.edit.saved')}</Alert.Root>
	{/if}
	{#if form?.error}
		<Alert.Root variant="destructive" class="text-sm">{form.error}</Alert.Root>
	{/if}

	<!-- Cover image -->
	<div class="flex flex-col gap-2">
		<Label>{$_('spot.edit.cover.label')}</Label>
		<div class="relative">
			<div class="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
				{#if coverPreview}
					<img src={coverPreview} alt="" class="h-full w-full object-cover" />
				{:else}
					<span class="text-3xl">{spotIcon}</span>
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
		{#if coverVision?.scene}
			<p class="text-xs text-muted-foreground">{coverVision.scene}</p>
		{/if}
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="self-start text-primary"
			onclick={() => coverInput.click()}
			disabled={coverUploading}
		>
			{$_('spot.edit.cover.change')}
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
		<div class="flex gap-2">
			<div class="flex w-16 shrink-0 flex-col gap-1.5">
				<Label>{$_('spot.edit.icon.label')}</Label>
				<Input type="text" name="icon" class="text-center text-lg" bind:value={spotIcon} maxlength={4} />
			</div>
			<div class="flex flex-1 flex-col gap-1.5">
				<Label>{$_('spot.edit.name.label')}</Label>
				<Input type="text" name="name" bind:value={spotName} />
			</div>
		</div>

		<div class="flex flex-col gap-2">
			<Label>{$_('space.new.location.label')}</Label>

			<SegmentedToggle
				value={mode}
				options={[
					{ value: 'search', label: $_('space.new.location.search'), onSelect: () => (mode = 'search') },
					{ value: 'pin', label: $_('space.new.location.pin'), onSelect: () => (mode = 'pin') }
				]}
			/>

			{#if mode === 'search'}
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
										class="w-full px-3 py-2 text-left text-sm hover:bg-accent"
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
		</div>

		<input type="hidden" name="lat" value={lat ?? ''} />
		<input type="hidden" name="lng" value={lng ?? ''} />

		<Button type="submit" variant="default" class="w-full" disabled={submitting || !spotName}>
			{#if submitting}<Spinner size="sm" />{/if}
			{$_('spot.edit.submit')}
		</Button>
	</form>

	<Button type="button" variant="outline" class="w-full" onclick={handleDownloadSign} disabled={signDownloading}>
		{#if signDownloading}<Spinner size="sm" />{/if}
		{$_('spot.edit.sign.download')}
	</Button>
</div>
