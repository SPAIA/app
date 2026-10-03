<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { resizeImageFile } from '$lib/media/resizeImage';
	import type { HabitatScore } from '$lib/server/habitatScore';

	// Anything bigger is almost certainly not a normal phone photo; we resize
	// before upload anyway, but decoding a huge file can stall a phone.
	const MAX_INPUT_BYTES = 30 * 1024 * 1024;
	const GENERIC_ERROR = 'Das hat gerade nicht geklappt. Versuch es noch einmal mit einem neuen Foto.';

	type Phase = 'idle' | 'analysing' | 'result' | 'error';

	let phase = $state<Phase>('idle');
	let previewUrl = $state<string | null>(null);
	let result = $state<HabitatScore | null>(null);
	let errorMessage = $state(GENERIC_ERROR);

	let cameraInput: HTMLInputElement;
	let galleryInput: HTMLInputElement;

	function setPreview(file: File | null) {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = file ? URL.createObjectURL(file) : null;
	}

	function fail(message = GENERIC_ERROR) {
		errorMessage = message;
		phase = 'error';
	}

	async function onFileSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const original = input.files?.[0];
		input.value = ''; // so picking the same photo again still fires change
		if (!original) return;

		if (!original.type.startsWith('image/')) {
			setPreview(null);
			return fail('Das ist leider kein Foto. Probier es mit einem Bild (JPG oder PNG).');
		}
		if (original.size > MAX_INPUT_BYTES) {
			setPreview(null);
			return fail('Das Foto ist zu groß. Probier es mit einem kleineren Bild.');
		}

		result = null;
		phase = 'analysing';

		// 1600px keeps flowers, soil and paving distinguishable while staying a quick upload.
		const file = await resizeImageFile(original, 1600, 0.85);
		setPreview(file);

		const body = new FormData();
		body.append('file', file);

		try {
			const res = await fetch('/api/habitat', { method: 'POST', body });
			if (res.status === 415) return fail('Dieses Bildformat kennen wir nicht. Probier es mit JPG oder PNG.');
			if (res.status === 413) return fail('Das Foto ist zu groß. Probier es mit einem kleineren Bild.');
			if (!res.ok) return fail();
			result = (await res.json()) as HabitatScore;
			phase = 'result';
		} catch {
			fail();
		}
	}

	function reset() {
		setPreview(null);
		result = null;
		phase = 'idle';
		window.scrollTo({ top: 0 });
	}

	onDestroy(() => setPreview(null));
</script>

<svelte:head>
	<title>Wie insektenfreundlich ist dieser Ort? · SPAIA</title>
</svelte:head>

<input bind:this={cameraInput} type="file" accept="image/*" capture="environment" class="sr-only" onchange={onFileSelected} />
<input bind:this={galleryInput} type="file" accept="image/*" class="sr-only" onchange={onFileSelected} />

<div class="flex flex-col gap-8 px-5 pt-10 pb-8">
	{#if phase === 'idle'}
		<header class="flex flex-col gap-4">
			<h1 class="spaia-display">Wie insektenfreundlich ist dieser Ort?</h1>
			<p class="text-[15px] leading-[1.55] text-muted-foreground">
				Mach ein Foto und finde es in wenigen Sekunden heraus.
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
		{:else if phase === 'result' && result}
			<section class="flex flex-col items-center gap-2 text-center" aria-live="polite">
				<p class="tabular" style="font-family: var(--font-display); font-weight: 800; line-height: 1; letter-spacing: -0.02em;">
					<span class="text-7xl">{result.score}</span>
					<span class="text-2xl text-muted-foreground"> / 100</span>
				</p>
				<p class="spaia-title text-xl">{result.verdict}</p>
			</section>

			<section class="flex flex-col gap-3 rounded-xl bg-card p-5">
				<h2 class="spaia-title text-base">Gut für Insekten</h2>
				<ul class="flex flex-col gap-2">
					{#each result.good as item}
						<li class="flex gap-3 text-[15px] leading-[1.45]">
							<span class="mt-[0.4em] size-2 shrink-0 rounded-full bg-accent"></span>{item}
						</li>
					{/each}
				</ul>
			</section>

			<section class="flex flex-col gap-3 rounded-xl bg-card p-5">
				<h2 class="spaia-title text-base">Noch besser wäre</h2>
				<ul class="flex flex-col gap-2">
					{#each result.improve as item}
						<li class="flex gap-3 text-[15px] leading-[1.45]">
							<span class="mt-[0.4em] size-2 shrink-0 rounded-full border-2 border-primary"></span>{item}
						</li>
					{/each}
				</ul>
			</section>

			<p class="text-center text-[15px] leading-[1.55] text-muted-foreground italic">{result.curiosity}</p>

			<Button size="lg" class="h-14 w-full text-[14.5px] font-semibold" onclick={reset}>Anderen Ort testen</Button>
		{:else if phase === 'error'}
			<div class="flex flex-col gap-6 text-center" role="alert">
				<p class="text-[15px] leading-[1.55] text-foreground">{errorMessage}</p>
				<Button size="lg" class="h-14 w-full text-[14.5px] font-semibold" onclick={reset}>Neues Foto</Button>
			</div>
		{/if}
	{/if}
</div>
