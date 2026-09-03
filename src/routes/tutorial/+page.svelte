<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { insectImage } from '$lib/insectImage';
	import type { PageData } from './$types';

	export let data: PageData;

	let track: HTMLDivElement;
	let activeIndex = 0;

	function onScroll() {
		if (!track || track.children.length === 0) return;
		const cardWidth = (track.children[0] as HTMLElement).offsetWidth;
		activeIndex = Math.round(track.scrollLeft / cardWidth);
	}

	function done() {
		if (history.length > 1) {
			history.back();
		} else {
			goto('/observe');
		}
	}
</script>

<svelte:head>
	<title>{$_('observe.intro.title')} — {$_('app.name')}</title>
</svelte:head>

<!-- 6rem matches +layout.svelte's `main` pb-24, which reserves space above the fixed bottom nav. -->
<div class="flex h-[calc(100dvh-6rem)] flex-col gap-4 px-5 py-6">
	<div class="flex items-center gap-3">
		<button onclick={done} class="btn btn-ghost btn-sm btn-circle" aria-label={$_('tutorial.back')}>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<div>
			<h1 class="text-lg font-medium text-base-content">{$_('observe.intro.title')}</h1>
			<p class="mt-1 text-sm text-base-content/60">{$_('observe.intro.body')}</p>
		</div>
	</div>

	<div class="-mx-5 min-h-0 flex-1">
		<div
			bind:this={track}
			onscroll={onScroll}
			class="flex h-full snap-x snap-mandatory gap-4 overflow-x-auto px-5"
		>
			{#each data.insectTypes as insect}
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
		{#each data.insectTypes as _insect, i}
			<span
				class="h-1.5 w-1.5 rounded-full transition-colors"
				class:bg-primary={i === activeIndex}
				class:bg-base-300={i !== activeIndex}
			></span>
		{/each}
	</div>

	<button class="btn btn-primary w-full" onclick={done}>
		{$_('tutorial.done')}
	</button>
</div>
