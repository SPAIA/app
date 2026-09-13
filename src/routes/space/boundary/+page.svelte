<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import centerOfMass from '@turf/center-of-mass';
	import BoundaryDraw from '$lib/components/BoundaryDraw.svelte';
	import { takeBoundaryDraft, setBoundaryResult } from '$lib/boundaryHandoff';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	export let data: PageData;

	let lat: number | null = null;
	let lng: number | null = null;
	let geojson: string | null = null;
	let areaM2 = 0;
	let returnTo = '/space/new';
	let ready = false;

	onMount(() => {
		const draft = takeBoundaryDraft();
		if (draft) {
			lat = draft.lat;
			lng = draft.lng;
			geojson = draft.geojson;
			returnTo = draft.returnTo || returnTo;
		}
		ready = true;
	});

	function done() {
		let centerLat: number | null = null;
		let centerLng: number | null = null;
		if (geojson) {
			const coords = centerOfMass(JSON.parse(geojson)).geometry.coordinates;
			centerLng = coords[0];
			centerLat = coords[1];
		}
		setBoundaryResult({ geojson, areaM2, lat: centerLat, lng: centerLng });
		goto(returnTo);
	}

	function cancel() {
		goto(returnTo);
	}
</script>

<svelte:head>
	<title>{$_('space.new.boundary.label')} — {$_('app.name')}</title>
</svelte:head>

<div class="absolute inset-0 flex flex-col">
	<div class="flex items-center justify-between border-b border-border px-4 py-3">
		<Button type="button" variant="ghost" size="sm" onclick={cancel}>{$_('space.new.boundary.cancel')}</Button>
		<span class="text-sm font-medium text-foreground">{$_('space.new.boundary.label')}</span>
		<Button type="button" variant="default" size="sm" onclick={done}>{$_('space.new.boundary.done')}</Button>
	</div>

	<div class="relative min-h-0 flex-1">
		{#if ready}
			<BoundaryDraw fullscreen bind:geojson bind:areaM2 {lat} {lng} stadiaApiKey={data.stadiaApiKey} />
		{/if}
	</div>
</div>
