<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import HabitatResult from '$lib/components/HabitatResult.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { resizeImageFile } from '$lib/media/resizeImage';
	import type { HabitatRead } from '$lib/habitat';

	let { data } = $props();

	// Anything bigger is almost certainly not a normal phone photo; we resize
	// before upload anyway, but decoding a huge file can stall a phone.
	const MAX_INPUT_BYTES = 30 * 1024 * 1024;
	const GENERIC_ERROR = 'Das hat gerade nicht geklappt. Versuch es noch einmal mit einem neuen Foto.';

	type Phase = 'idle' | 'analysing' | 'result' | 'error';

	let phase = $state<Phase>('idle');
	let previewUrl = $state<string | null>(null);
	let result = $state<HabitatRead | null>(null);
	let errorMessage = $state(GENERIC_ERROR);
	/** null = signed in, no limit. Seeded from the server, then kept in sync by each scan's response. */
	let scansLeft = $state<number | null>(untrack(() => data.scansLeft));
	let signupOpen = $state(false);

	const loginHref = '/auth/login?next=/habitat';
	const NUMBER_WORDS = ['null', 'einen', 'zwei', 'drei', 'vier', 'fünf'];
	const testedPlaces = $derived(NUMBER_WORDS[data.freeScans] ?? String(data.freeScans));

	let cameraInput: HTMLInputElement;
	let galleryInput: HTMLInputElement;

	function setPreview(file: File | null) {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = file ? URL.createObjectURL(file) : null;
	}

	function startScan(input: HTMLInputElement) {
		if (scansLeft === 0) {
			signupOpen = true;
			return;
		}
		input.click();
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
			if (res.status === 429) {
				// Out of free scans (e.g. another tab used the last one) — not an error, a nudge.
				scansLeft = 0;
				setPreview(null);
				phase = 'idle';
				signupOpen = true;
				return;
			}
			if (res.status === 415) return fail('Dieses Bildformat kennen wir nicht. Probier es mit JPG oder PNG.');
			if (res.status === 413) return fail('Das Foto ist zu groß. Probier es mit einem kleineren Bild.');
			if (!res.ok) return fail();
			const payload = (await res.json()) as { result: HabitatRead; scansLeft: number | null };
			result = payload.result;
			scansLeft = payload.scansLeft;
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
		if (scansLeft === 0) signupOpen = true;
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
			<h1 class="spaia-display" lang="de">Wie insekten&shy;freundlich ist dieser Ort?</h1>
			<p class="text-[15px] leading-[1.55] text-muted-foreground">
				Mach ein Foto und finde es in wenigen Sekunden heraus.
			</p>
		</header>

		<div class="flex flex-col gap-3">
			<Button size="lg" class="h-14 w-full text-[14.5px] font-semibold" onclick={() => startScan(cameraInput)}>
				Foto aufnehmen
			</Button>
			<Button variant="ghost" size="lg" class="h-12 w-full" onclick={() => startScan(galleryInput)}>
				Foto aus der Galerie wählen
			</Button>
			{#if scansLeft !== null}
				<p class="text-center text-[13px] text-muted-foreground">
					{#if scansLeft === 0}
						Deine kostenlosen Scans sind aufgebraucht.
					{:else if scansLeft === 1}
						Noch 1 kostenloser Scan
					{:else}
						Noch {scansLeft} kostenlose Scans
					{/if}
				</p>
			{/if}
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
			<HabitatResult {result} />

			<div class="flex flex-col gap-3">
				<Button size="lg" class="h-auto min-h-14 w-full py-3 text-[14.5px] font-semibold whitespace-normal" href="/ort">
					Einen Ort hinzufügen, der dir wichtig ist
				</Button>
				<Button variant="outline" size="lg" class="h-12 w-full" onclick={reset}>Anderen Ort testen</Button>
			</div>

			<a href="/observe" class="text-center text-[15px] leading-[1.55] text-muted-foreground">
				Stimmen die Insekten zu? <span class="font-semibold text-foreground underline">5 Minuten Insekten zählen →</span>
			</a>
		{:else if phase === 'error'}
			<div class="flex flex-col gap-6 text-center" role="alert">
				<p class="text-[15px] leading-[1.55] text-foreground">{errorMessage}</p>
				<Button size="lg" class="h-14 w-full text-[14.5px] font-semibold" onclick={reset}>Neues Foto</Button>
			</div>
		{/if}
	{/if}
</div>

<Dialog.Root bind:open={signupOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title class="spaia-title text-xl">Du hast {testedPlaces} Orte getestet. Welcher ist dir wichtig?</Dialog.Title>
			<Dialog.Description class="text-[15px] leading-[1.55]">
				Mit deinem SPAIA-Profil kannst du weitere Orte testen und deine Orte weiter beobachten.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-2 pt-2">
			<Button size="lg" class="h-auto min-h-12 w-full py-3 text-[14.5px] font-semibold whitespace-normal" href="/ort">
				Ort hinzufügen und weiter beobachten
			</Button>
			<Button variant="ghost" size="lg" class="h-12 w-full" href={loginHref}>Ich habe schon ein Konto</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
