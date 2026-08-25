<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { sessionStore } from '$lib/stores/session';
	import { nowISO } from '$lib/time';
	import { insectImage } from '$lib/insectImage';
	import type { InsectType } from '$lib/types';

	export let insectTypes: InsectType[] = [];

	let track: HTMLDivElement;
	let activeIndex = 0;

	function onScroll() {
		if (!track || track.children.length === 0) return;
		const cardWidth = (track.children[0] as HTMLElement).offsetWidth;
		activeIndex = Math.round(track.scrollLeft / cardWidth);
	}

	function start() {
		sessionStore.update((s) => ({ ...s, startedAt: nowISO(), step: 'observe' }));
	}
</script>

<!-- 6rem matches +layout.svelte's `main` pb-24, which reserves space above the fixed bottom nav. -->
<div class="flex h-[calc(100dvh-6rem)] flex-col gap-4 px-5 py-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-medium text-base-content">{$_('observe.intro.title')}</h1>
			<p class="mt-1 text-sm text-base-content/60">{$_('observe.intro.body')}</p>
		</div>
		<button class="shrink-0 text-xs font-medium text-base-content/40" onclick={start}>
			{$_('observe.intro.skip')}
		</button>
	</div>

	<div class="-mx-5 min-h-0 flex-1">
		<div
			bind:this={track}
			onscroll={onScroll}
			class="flex h-full snap-x snap-mandatory gap-4 overflow-x-auto px-5"
		>
			{#each insectTypes as insect}
				<div
					class="flex h-full w-[78%] shrink-0 snap-center flex-col overflow-hidden rounded-3xl border border-base-300 bg-base-100 text-center"
				>
					<img src={insectImage(insect.name)} alt="" class="aspect-square w-full object-cover" />
					<div class="flex flex-1 flex-col items-center justify-center gap-2 px-6">
						<span class="text-xl font-semibold text-base-content">{$_(`insect.${insect.name}`)}</span>
						<span class="text-sm text-base-content/60">{$_(`observe.intro.tip.${insect.name}`)}</span>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="flex justify-center gap-1.5">
		{#each insectTypes as _insect, i}
			<span
				class="h-1.5 w-1.5 rounded-full transition-colors"
				class:bg-primary={i === activeIndex}
				class:bg-base-300={i !== activeIndex}
			></span>
		{/each}
	</div>

	<button class="btn btn-primary w-full" onclick={start}>
		{$_('observe.intro.cta')}
	</button>
</div>
