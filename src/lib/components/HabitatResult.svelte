<script lang="ts">
	import { habitatSignal, type HabitatRead } from '$lib/habitat';

	// Score, signal band and the three visible features — shared by /habitat
	// (live DeepSeek read) and /naturlabor (scripted demo read).
	let { result }: { result: HabitatRead } = $props();
</script>

<section class="flex flex-col items-center gap-2 text-center" aria-live="polite">
	<p class="tabular" style="font-family: var(--font-display); font-weight: 800; line-height: 1; letter-spacing: -0.02em;">
		<span class="text-7xl">{result.score}</span>
		<span class="text-2xl text-muted-foreground"> / 100</span>
	</p>
	<p class="spaia-title text-xl">{habitatSignal(result.score)}</p>
	<p class="text-[13px] text-muted-foreground">Bildbasierte Einschätzung</p>
</section>

<ul class="flex flex-col gap-3 rounded-xl bg-card p-5">
	{#each result.features as feature}
		<li class="flex items-center gap-3 text-[15px] leading-[1.45]">
			<span class="text-xl" aria-hidden="true">{feature.emoji}</span>{feature.text}
		</li>
	{/each}
</ul>
