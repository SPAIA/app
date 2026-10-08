<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PLACE_TYPES, isPlaceType, type PlaceType } from '$lib/placeTypes';

	let { data, form } = $props();

	const initialType = page.url.searchParams.get('type');
	let placeType = $state<PlaceType | null>(isPlaceType(initialType) ? initialType : null);
	let submitting = $state(false);

	function addNow() {
		if (!placeType) return;
		// Full navigation: /ort/start is a server redirect (sign-up → free spot → /spot/new), not a page.
		window.location.href = `/ort/start?type=${placeType}`;
	}
</script>

<svelte:head>
	<title>Welcher Ort ist dir wichtig? · SPAIA</title>
</svelte:head>

<div class="flex flex-col gap-8 px-5 pt-10 pb-8">
	<header class="flex flex-col gap-4">
		<h1 class="spaia-display" lang="de">Welcher Ort ist dir wichtig?</h1>
		<p class="text-[15px] leading-[1.55] text-muted-foreground">
			Hilf uns, Stadtnatur in Deutschland besser zu verstehen – durch die Insekten, die dort leben.
		</p>
	</header>

	<div class="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Art des Ortes">
		{#each PLACE_TYPES as type}
			<button
				type="button"
				role="radio"
				aria-checked={placeType === type.id}
				onclick={() => (placeType = type.id)}
				class="flex min-h-14 items-center gap-2 rounded-xl border-2 px-4 py-3 text-left text-[15px] font-medium transition-colors
					{placeType === type.id ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card'}
					{type.id === 'anderer' ? 'col-span-2' : ''}"
			>
				<span class="text-xl" aria-hidden="true">{type.emoji}</span>{type.label}
			</button>
		{/each}
	</div>

	<div class="flex flex-col gap-3">
		<Button size="lg" class="h-14 w-full text-[14.5px] font-semibold" disabled={!placeType} onclick={addNow}>
			Ort jetzt hinzufügen
		</Button>
		{#if !data.signedIn}
			<p class="text-center text-[13px] leading-[1.5] text-muted-foreground">
				Mit deinem SPAIA-Profil kannst du weitere Orte testen und deine Orte weiter beobachten.
			</p>
		{/if}
	</div>

	<section class="flex flex-col gap-4 rounded-xl bg-card p-5">
		{#if form?.success}
			<p class="spaia-title text-lg">Link ist unterwegs!</p>
			<p class="text-[15px] leading-[1.55]">Öffne ihn, wenn du an deinem Ort bist – dann fügst du ihn mit einem Tipp hinzu.</p>
		{:else}
			<h2 class="spaia-title text-lg">Nicht hier? Wir erinnern dich.</h2>
			<form
				method="POST"
				action="?/remind"
				class="flex flex-col gap-3"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update({ reset: false });
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="place_type" value={placeType ?? ''} />
				<!-- as a field, not the query: action="?/remind" replaces the page's query string -->
				<input type="hidden" name="from" value={page.url.searchParams.get('from') ?? ''} />
				<Input
					type="email"
					name="email"
					required
					autocomplete="email"
					inputmode="email"
					placeholder="deine@email.de"
					aria-label="E-Mail-Adresse"
					class="h-12 text-[15px]"
				/>
				{#if form?.error}
					<p class="text-[13px] text-destructive" role="alert">
						{form.error === 'invalid'
							? 'Bitte gib eine gültige E-Mail-Adresse ein.'
							: 'Das hat gerade nicht geklappt. Versuch es gleich noch einmal.'}
					</p>
				{/if}
				<Button type="submit" variant="outline" size="lg" class="h-12 w-full text-[14.5px] font-semibold" disabled={submitting}>
					{#if submitting}<Spinner size="sm" />{/if}
					Link schicken
				</Button>
				<p class="text-[12px] leading-[1.45] text-muted-foreground">
					Mit dem Link bestätigst du auch deine E-Mail-Adresse. Wir nutzen sie nur dafür.
					<a href="/privacy" class="underline">Datenschutz</a>
				</p>
			</form>
		{/if}
	</section>
</div>
