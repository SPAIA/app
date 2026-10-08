<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();
	const startHref = $derived(`/ort/start${data.placeType ? `?type=${data.placeType}` : ''}`);
</script>

<svelte:head>
	<title>Ort hinzufügen · SPAIA</title>
</svelte:head>

<div class="flex flex-col gap-6 px-5 pt-16 pb-8 text-center">
	<span class="text-5xl">🐛</span>
	{#if data.confirmed}
		<h1 class="spaia-title text-[28px] leading-[1.2]">Bist du jetzt an deinem Ort?</h1>
		<p class="text-[15px] leading-[1.55] text-muted-foreground">
			Deine E-Mail-Adresse ist bestätigt. Füge deinen Ort hinzu – dann können wir gemeinsam beobachten, welche
			Insekten dort leben.
		</p>
		<Button href={startHref} size="lg" class="mt-2 h-14 w-full text-[14.5px] font-semibold">Ort jetzt hinzufügen</Button>
		<p class="text-[13px] text-muted-foreground">Noch nicht dort? Öffne diesen Link einfach später noch einmal.</p>
	{:else}
		<h1 class="spaia-title text-[28px] leading-[1.2]">Dieser Link funktioniert nicht mehr</h1>
		<p class="text-[15px] leading-[1.55] text-muted-foreground">
			Vielleicht hast du dir danach noch einen Link schicken lassen – dann nimm den aus der neuesten E-Mail.
		</p>
		<Button href="/ort" size="lg" class="mt-2 h-14 w-full text-[14.5px] font-semibold">Neuen Link anfordern</Button>
	{/if}
</div>
