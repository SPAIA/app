<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import HabitatResult from '$lib/components/HabitatResult.svelte';
	import type { HabitatRead } from '$lib/habitat';

	let { data } = $props();

	// Scripted demo of the /habitat experience for visitors at the Naturlabor:
	// the photo never leaves the phone, and the read is always this one.
	const RESULT: HabitatRead = {
		score: 84,
		features: [
			{ emoji: '🌸', text: 'Viele Blüten' },
			{ emoji: '🌿', text: 'Dichte Vegetation' },
			{ emoji: '🌱', text: 'Verschiedene Pflanzen' }
		]
	};
	// The landing page asks "Was könnten wir besser machen?" — this answers it.
	const IMPROVE = ['Mehr Raum für Natur', 'Mehr offene Erde', 'Totholz ergänzen'];
	const ANALYSIS_MS = 3200;

	let phase = $state<'idle' | 'analysing' | 'result'>('idle');
	let previewUrl = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	let cameraInput: HTMLInputElement;
	let galleryInput: HTMLInputElement;

	function onFileSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
		phase = 'analysing';
		timer = setTimeout(() => {
			phase = 'result';
			window.scrollTo({ top: 0 });
		}, ANALYSIS_MS);
	}

	onDestroy(() => {
		clearTimeout(timer);
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});
</script>

<svelte:head>
	<title>Wie insektenfreundlich ist das Naturlabor? · SPAIA</title>
</svelte:head>

<input bind:this={cameraInput} type="file" accept="image/*" capture="environment" class="sr-only" onchange={onFileSelected} />
<input bind:this={galleryInput} type="file" accept="image/*" class="sr-only" onchange={onFileSelected} />

<div class="flex flex-col gap-8 px-5 pt-10 pb-8">
	{#if phase === 'idle'}
		<header class="flex flex-col gap-4">
			<h1 class="spaia-display" lang="de">Wie insekten&shy;freundlich ist das SPAIA Naturlabor?</h1>
			<p class="text-[15px] leading-[1.55] text-muted-foreground">
				Was könnten wir besser machen? Scann es und finde es heraus.
			</p>
		</header>

		<div class="flex flex-col gap-3">
			<Button size="lg" class="h-14 w-full text-[14.5px] font-semibold" onclick={() => cameraInput.click()}>
				Foto aufnehmen
			</Button>
			<Button variant="ghost" size="lg" class="h-12 w-full" onclick={() => galleryInput.click()}>
				Foto aus der Galerie wählen
			</Button>
		</div>

		<!-- Many open the event link later at home — send them to the real scanner for wherever they are. -->
		<Button variant="outline" size="lg" class="h-12 w-full" href="/habitat">Ich bin nicht im Naturlabor</Button>
	{:else}
		{#if previewUrl}
			<div class="relative overflow-hidden rounded-xl bg-muted">
				<img
					src={previewUrl}
					alt="Dein Foto"
					class="aspect-[4/3] w-full object-cover transition-opacity {phase === 'analysing' ? 'opacity-60' : ''}"
				/>
				{#if phase === 'analysing'}
					<div class="absolute inset-0 animate-pulse bg-accent/20"></div>
				{/if}
			</div>
		{/if}

		{#if phase === 'analysing'}
			<div class="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
				<Spinner size="lg" />
				<p class="text-[15px] text-foreground">Wir schauen uns den Lebensraum an …</p>
			</div>
		{:else}
			<HabitatResult result={RESULT} />

			<section class="flex flex-col gap-3 rounded-xl bg-card p-5">
				<h2 class="spaia-title text-base">Noch besser wäre</h2>
				<ul class="flex flex-col gap-2">
					{#each IMPROVE as item}
						<li class="flex gap-3 text-[15px] leading-[1.45]">
							<span class="mt-[0.4em] size-2 shrink-0 rounded-full border-2 border-primary"></span>{item}
						</li>
					{/each}
				</ul>
			</section>

			<p class="rounded-xl bg-accent/25 p-5 text-[15px] leading-[1.55]">
				<span class="font-semibold">Tipp:</span> Die Bartblume ist nicht heimisch – aber Bestäuber lieben sie spät im
				Jahr.
			</p>

			{#if data.totals}
				<section class="flex flex-col gap-2 text-center">
					<h2 class="spaia-title text-xl">Und die Insekten?</h2>
					<p class="text-[15px] leading-[1.55]">
						{#if data.totals.sessions === 0}
							Hier hat noch niemand Insekten gezählt – mach die erste Naturpause!
						{:else}
							Hier wurden bisher
							<strong class="tabular">{data.totals.insects} {data.totals.insects === 1 ? 'Insekt' : 'Insekten'}</strong>
							in
							<strong class="tabular">{data.totals.sessions} {data.totals.sessions === 1 ? 'Naturpause' : 'Naturpausen'}</strong>
							beobachtet.
						{/if}
					</p>
				</section>
			{/if}

			<div class="flex flex-col gap-3">
				<Button size="lg" class="h-auto min-h-14 w-full py-3 text-[14.5px] font-semibold whitespace-normal" href="/ort?from=naturlabor">
					Einen Ort hinzufügen, der dir wichtig ist
				</Button>
				<Button variant="outline" size="lg" class="h-12 w-full" href="/habitat">Anderen Ort testen</Button>
			</div>

			{#if data.spotSlug}
				<a href="/observe/{data.spotSlug}" class="text-center text-[15px] leading-[1.55] text-muted-foreground">
					Stimmen die Insekten zu? <span class="font-semibold text-foreground underline">5 Minuten Insekten zählen →</span>
				</a>
			{/if}
		{/if}
	{/if}
</div>
