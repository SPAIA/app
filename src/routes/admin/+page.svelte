<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	const exports = [
		{
			table: 'observations',
			label: 'Sightings + spot + weather (joined)',
			description: 'One row per sighting, joined with its spot and matched weather reading — ready for charting.'
		},
		{ table: 'spots', label: 'Spots', description: 'All spots — location, name, status.' },
		{
			table: 'sessions',
			label: 'Sessions',
			description: 'Every observation session — spot, timing, weather link.'
		},
		{ table: 'sightings', label: 'Sightings', description: 'Every insect tap, tied to a session.' },
		{
			table: 'weather_observations',
			label: 'Weather observations',
			description: 'Raw weather readings (Bright Sky for Germany, Visual Crossing elsewhere).'
		}
	];
</script>

<svelte:head>
	<title>Admin</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Admin</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Export data</Card.Title>
			<Card.Description>Download CSVs of spots, weather and sightings for data visualisations.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			{#each exports as item (item.table)}
				<div class="flex items-center justify-between gap-4">
					<div>
						<div class="font-medium">{item.label}</div>
						<div class="text-sm text-muted-foreground">{item.description}</div>
					</div>
					<Button href={`/api/admin/export/${item.table}`} variant="outline">Download</Button>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
