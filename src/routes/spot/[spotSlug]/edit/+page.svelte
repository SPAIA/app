<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import SegmentedToggle from '$lib/components/SegmentedToggle.svelte';
	import { downloadSpotSign } from '$lib/sign';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
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
	let moveOpen = false;
	let moving = false;
	let moveTarget = '';
	let newSpaceName = '';
	let deleteOpen = false;
	let deleting = false;

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

	// Uploads via the spot's photo endpoint with vision skipped: changing the
	// cover only swaps the picture and never renames the spot or rewrites its
	// description.
	async function handleCoverChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		coverUploading = true;
		coverError = '';
		coverPreview = URL.createObjectURL(file);

		const body = new FormData();
		body.append('file', file);
		body.append('vision', 'skip');

		const res = await fetch(`/api/spot/${data.spot.id}/photo`, { method: 'POST', body });

		if (!res.ok) {
			const detail = await res.json().catch(() => ({ message: 'Upload failed' }));
			coverError = detail.message ?? 'Upload failed';
			coverUploading = false;
			return;
		}

		const result = (await res.json()) as {
			media: { id: string; url: string };
		};

		const previous = cover;
		cover = { id: result.media.id } as Media;
		coverPreview = result.media.url;
		coverUploading = false;

		if (previous) {
			await fetch(`/api/media/${previous.id}`, { method: 'DELETE' });
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

	<Button type="button" variant="outline" class="w-full" onclick={() => (moveOpen = true)}>
		{$_('spot.edit.move')}
	</Button>

	<Button type="button" variant="ghost" class="w-full text-destructive" onclick={() => (deleteOpen = true)}>
		{$_('spot.edit.delete')}
	</Button>
</div>

<Dialog.Root bind:open={moveOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{$_('spot.edit.move.title')}</Dialog.Title>
			<Dialog.Description>{$_('spot.edit.move.body', { values: { name: data.spot.name } })}</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/move" use:enhance={() => {
			moving = true;
			return async ({ update }) => {
				await update();
				moving = false;
				moveOpen = false;
			};
		}} class="flex flex-col gap-4">
			{#if data.moveTargets.length > 0}
				<div class="flex flex-col gap-2">
					{#each data.moveTargets as target}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/10"
						>
							<input
								type="radio"
								name="targetSpace"
								value={target.slug}
								bind:group={moveTarget}
								onchange={() => (newSpaceName = '')}
								class="accent-primary"
							/>
							<span>{target.icon}</span>
							<span class="flex-1">{target.name}</span>
						</label>
					{/each}
				</div>
			{/if}

			<div class="flex flex-col gap-1.5">
				<Label>{$_('spot.edit.move.new.label')}</Label>
				<Input
					type="text"
					name="newSpaceName"
					placeholder={$_('spot.edit.move.new.placeholder')}
					bind:value={newSpaceName}
					oninput={() => (moveTarget = '')}
				/>
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (moveOpen = false)} disabled={moving}>
					{$_('spot.edit.delete.cancel')}
				</Button>
				<Button type="submit" disabled={moving || (!moveTarget && !newSpaceName.trim())}>
					{#if moving}<Spinner size="sm" />{/if}
					{$_('spot.edit.move.confirm')}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{$_('spot.edit.delete.title')}</Dialog.Title>
			<Dialog.Description>{$_('spot.edit.delete.body', { values: { name: data.spot.name } })}</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/delete" use:enhance={() => {
			deleting = true;
			return async ({ update }) => {
				await update();
				deleting = false;
				deleteOpen = false;
			};
		}}>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (deleteOpen = false)} disabled={deleting}>
					{$_('spot.edit.delete.cancel')}
				</Button>
				<Button type="submit" variant="destructive" disabled={deleting}>
					{#if deleting}<Spinner size="sm" />{/if}
					{$_('spot.edit.delete.confirm')}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
