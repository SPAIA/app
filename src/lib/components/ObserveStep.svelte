<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { sessionStore } from '$lib/stores/session';
	import { nowISO } from '$lib/time';
	import { insectImage } from '$lib/insectImage';
	import type { InsectType } from '$lib/types';

	export let insectTypes: InsectType[] = [];

	let timeLeft = 0;
	let totalSeconds = 0;
	let interval: ReturnType<typeof setInterval>;
	let buttonScales: Record<string, number> = {};

	$: {
		totalSeconds = $sessionStore.durationMin * 60;
		if (timeLeft === 0) timeLeft = totalSeconds;
	}

	onMount(() => {
		timeLeft = $sessionStore.durationMin * 60;
		totalSeconds = timeLeft;
		interval = setInterval(tick, 1000);
	});

	onDestroy(() => {
		clearInterval(interval);
	});

	function tick() {
		if (timeLeft > 0) {
			timeLeft -= 1;
		} else {
			clearInterval(interval);
			advance();
		}
	}

	function advance() {
		sessionStore.update((s) => ({ ...s, step: 'cards' }));
	}

	function tapInsect(insect: InsectType) {
		sessionStore.update((s) => ({
			...s,
			counts: {
				...s.counts,
				[insect.name]: (s.counts[insect.name] ?? 0) + 1
			},
			taps: [...s.taps, { name: insect.name, tappedAt: nowISO() }],
			totalCount: s.totalCount + 1
		}));

		// Animate button
		buttonScales[insect.name] = 0.93;
		setTimeout(() => {
			buttonScales[insect.name] = 1;
			buttonScales = { ...buttonScales };
		}, 120);
		buttonScales = { ...buttonScales };
	}

	$: progressPercent = totalSeconds > 0 ? ((totalSeconds - timeLeft) / totalSeconds) * 100 : 0;

	function formatTime(seconds: number) {
		const m = Math.floor(seconds / 60).toString().padStart(2, '0');
		const s = (seconds % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	}
</script>

<div class="relative flex flex-col gap-4 px-5 py-6">
	<!-- Timer display -->
	<div class="rounded-xl border border-base-300 bg-base-200 p-4 text-center">
		<div class="font-mono text-4xl font-medium text-primary">{formatTime(timeLeft)}</div>
		<div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-base-300">
			<div
				class="h-full rounded-full bg-primary transition-all duration-1000"
				style="width: {progressPercent}%"
			></div>
		</div>
	</div>

	<!-- Running totals -->
	<div class="flex justify-center gap-6 text-sm">
		<span class="text-base-content/60">
			{$_('observe.timer.total')}:
			<strong class="text-base-content">{$sessionStore.totalCount}</strong>
		</span>
	</div>

	<!-- Insect grid -->
	<div class="grid grid-cols-2 gap-2">
		{#each insectTypes as insect}
			{@const count = $sessionStore.counts[insect.name] ?? 0}
			<button
				class="relative aspect-square overflow-hidden rounded-xl border border-base-300 transition-all"
				style="transform: scale({buttonScales[insect.name] ?? 1})"
				onclick={() => tapInsect(insect)}
			>
				{#if count > 0}
					<span class="absolute right-1.5 top-1.5 z-10 min-w-[18px] rounded-full bg-primary px-1 py-px text-center text-[9px] font-medium text-white">
						{count}
					</span>
				{/if}
				<img src={insectImage(insect.name)} alt="" class="absolute inset-0 h-full w-full object-cover" />
				<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-4">
					<span class="block px-2 pb-1.5 text-[10px] font-medium text-white">{$_(`insect.${insect.name}`)}</span>
				</div>
			</button>
		{/each}
	</div>

	<button class="btn btn-ghost btn-sm text-base-content/40" onclick={advance}>
		{$_('observe.timer.finish')}
	</button>
</div>
