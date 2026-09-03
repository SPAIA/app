<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import area from '@turf/area';
	import { formatArea } from '$lib/geo';
	import SegmentedToggle from './SegmentedToggle.svelte';

	/** Reference point to center the map on until a boundary exists. */
	export let lat: number | null = null;
	export let lng: number | null = null;
	export let stadiaApiKey: string;
	/** GeoJSON Polygon/MultiPolygon geometry (as a JSON string), or null if nothing's drawn. */
	export let geojson: string | null = null;
	export let areaM2 = 0;
	/** Fills its container edge-to-edge with the map, overlaying the mode toggle and toolbar on top of it instead of stacking them above/below. */
	export let fullscreen = false;

	const SATELLITE_SOURCE_ID = 'boundary-draw-satellite';
	const SATELLITE_LAYER_ID = 'boundary-draw-satellite-layer';

	type Ring = number[][];
	type PolygonCoords = Ring[];
	type BoundaryGeometry =
		| { type: 'Polygon'; coordinates: PolygonCoords }
		| { type: 'MultiPolygon'; coordinates: PolygonCoords[] };

	let mapContainer: HTMLDivElement;
	let mapInstance: import('maplibre-gl').Map | null = null;
	let draw: import('terra-draw').TerraDraw | null = null;
	let mapReady = false;
	let recentered = false;

	let uiMode: 'draw' | 'select' = 'draw';
	let basemap: 'streets' | 'satellite' = 'streets';
	let locating = false;
	let hasFeatures = false;
	let selectedId: string | number | null = null;
	let canUndo = false;
	let canRedo = false;

	function parseInitialGeometry(raw: string | null): Record<string, unknown>[] {
		if (!raw) return [];
		try {
			const geom = JSON.parse(raw) as BoundaryGeometry;
			const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
			return polygons.map((coordinates) => ({
				type: 'Feature',
				properties: { mode: 'polygon' },
				geometry: { type: 'Polygon', coordinates }
			}));
		} catch {
			return [];
		}
	}

	function toBoundaryGeometry(features: { geometry: { type: string; coordinates: unknown } }[]): BoundaryGeometry | null {
		const polygons = features
			.filter((f) => f.geometry.type === 'Polygon')
			.map((f) => f.geometry.coordinates as PolygonCoords);
		if (polygons.length === 0) return null;
		if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] };
		return { type: 'MultiPolygon', coordinates: polygons };
	}

	function syncFromStore() {
		if (!draw) return;
		const snapshot = draw.getSnapshot();
		hasFeatures = snapshot.length > 0;
		canUndo = draw.canUndo();
		canRedo = draw.canRedo();

		const geometry = toBoundaryGeometry(snapshot as never);
		geojson = geometry ? JSON.stringify(geometry) : null;
		areaM2 = geometry ? area({ type: 'FeatureCollection', features: snapshot } as never) : 0;
	}

	function setUiMode(next: 'draw' | 'select') {
		uiMode = next;
		draw?.setMode(next === 'draw' ? 'polygon' : 'select');
	}

	function deleteSelected() {
		if (!draw || selectedId == null) return;
		draw.removeFeatures([selectedId]);
		selectedId = null;
		syncFromStore();
	}

	function clearAll() {
		if (!draw) return;
		draw.clear();
		selectedId = null;
		syncFromStore();
	}

	function undo() {
		draw?.undo();
		syncFromStore();
	}

	function redo() {
		draw?.redo();
		syncFromStore();
	}

	function locateMe() {
		if (!navigator.geolocation || !mapInstance) return;
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				mapInstance?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 18 });
				locating = false;
			},
			() => {
				locating = false;
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

		const [
			mapLib,
			{ TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, TerraDrawModeUndoRedo, TerraDrawSessionUndoRedo },
			{ TerraDrawMapLibreGLAdapter }
		] = await Promise.all([
				import('maplibre-gl'),
				import('terra-draw'),
				import('terra-draw-maplibre-gl-adapter'),
				import('maplibre-gl/dist/maplibre-gl.css')
			]);

		const styleUrl = stadiaApiKey
			? `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${stadiaApiKey}`
			: 'https://demotiles.maplibre.org/style.json';

		const center: [number, number] = lat != null && lng != null ? [lng, lat] : [0, 20];
		const zoom = lat != null && lng != null ? 18 : 2;

		const map = new mapLib.Map({ container: mapContainer, style: styleUrl, center, zoom });
		mapInstance = map;

		const initialFeatures = parseInitialGeometry(geojson);

		draw = new TerraDraw({
			adapter: new TerraDrawMapLibreGLAdapter({ map }),
			modes: [
				new TerraDrawPolygonMode({ pointerDistance: 40 }),
				new TerraDrawSelectMode({
					flags: {
						polygon: {
							feature: {
								draggable: true,
								coordinates: { midpoints: true, draggable: true, deletable: true }
							}
						}
					}
				})
			],
			undoRedo: {
				modeLevel: new TerraDrawModeUndoRedo(),
				sessionLevel: new TerraDrawSessionUndoRedo()
			}
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

			draw?.start();

			if (initialFeatures.length > 0) {
				draw?.addFeatures(initialFeatures as never);
				uiMode = 'select';
				draw?.setMode('select');
			} else {
				uiMode = 'draw';
				draw?.setMode('polygon');
			}

			syncFromStore();
		});

		draw.on('change', () => syncFromStore());
		draw.on('select', (id) => (selectedId = id));
		draw.on('deselect', () => (selectedId = null));
		draw.on('finish', (id, context) => {
			if (context.action === 'draw') {
				draw?.selectFeature(id);
				uiMode = 'select';
			}
		});
	}

	onMount(async () => {
		await initMap();
	});

	onDestroy(() => {
		draw?.stop();
		mapInstance?.remove();
	});

	$: if (mapInstance && !hasFeatures && !recentered && lat != null && lng != null) {
		recentered = true;
		mapInstance.flyTo({ center: [lng, lat] });
	}
</script>

<div class={fullscreen ? 'relative h-full w-full' : 'flex flex-col gap-2'}>
	<div class={fullscreen ? 'absolute inset-x-3 top-3 z-10 flex items-center gap-2' : 'flex items-center gap-2'}>
		<div class="flex-1">
			<SegmentedToggle
				value={uiMode}
				options={[
					{ value: 'draw', label: $_('space.new.boundary.draw'), onSelect: () => setUiMode('draw') },
					{ value: 'select', label: $_('space.new.boundary.edit'), onSelect: () => setUiMode('select') }
				]}
			/>
		</div>
		<button type="button" class="btn btn-sm btn-outline bg-base-100" onclick={toggleBasemap}>
			{basemap === 'satellite' ? $_('space.new.boundary.map') : $_('space.new.boundary.satellite')}
		</button>
		<button
			type="button"
			class="btn btn-sm btn-square btn-outline bg-base-100"
			onclick={locateMe}
			disabled={locating}
			aria-label={$_('space.new.boundary.locate')}
		>
			{#if locating}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				>
					<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
					<circle cx="12" cy="12" r="7" />
					<line x1="12" y1="1" x2="12" y2="4" />
					<line x1="12" y1="20" x2="12" y2="23" />
					<line x1="1" y1="12" x2="4" y2="12" />
					<line x1="20" y1="12" x2="23" y2="12" />
				</svg>
			{/if}
		</button>
	</div>

	<div class={fullscreen ? 'absolute inset-0' : ''}>
		<div
			bind:this={mapContainer}
			class={fullscreen ? 'h-full w-full' : 'h-64 w-full overflow-hidden rounded-xl border border-base-300'}
		></div>
	</div>

	<div
		class={fullscreen
			? 'absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 rounded-t-2xl bg-base-100 px-4 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]'
			: 'flex flex-col gap-2'}
		style={fullscreen ? 'padding-bottom: max(env(safe-area-inset-bottom), 1rem)' : undefined}
	>
		<div class="flex items-center justify-between gap-2">
			<div class="flex gap-1">
				<button type="button" class="btn btn-ghost btn-xs" disabled={!canUndo} onclick={undo}>
					{$_('space.new.boundary.undo')}
				</button>
				<button type="button" class="btn btn-ghost btn-xs" disabled={!canRedo} onclick={redo}>
					{$_('space.new.boundary.redo')}
				</button>
				<button type="button" class="btn btn-ghost btn-xs text-error" disabled={selectedId == null} onclick={deleteSelected}>
					{$_('space.new.boundary.delete')}
				</button>
				<button type="button" class="btn btn-ghost btn-xs text-error" disabled={!hasFeatures} onclick={clearAll}>
					{$_('space.new.boundary.clear')}
				</button>
			</div>
			{#if hasFeatures}
				<span class="text-xs font-medium text-base-content/70">{formatArea(areaM2)}</span>
			{/if}
		</div>

		<p class="text-xs text-base-content/50">
			{uiMode === 'draw' ? $_('space.new.boundary.hint.draw') : $_('space.new.boundary.hint.select')}
		</p>
	</div>
</div>
