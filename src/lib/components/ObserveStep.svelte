<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { sessionStore } from '$lib/stores/session';
	import { nowISO } from '$lib/time';
	import { autosaveSession } from '$lib/sessionSave';
	import { insectImage } from '$lib/insectImage';
	import type { InsectType } from '$lib/types';

	export let insectTypes: InsectType[] = [];

	/** Autosave fires on every tap; while idle it also fires on this heartbeat. */
	const IDLE_SAVE_MS = 15000;

	let timeLeft = $sessionStore.durationMin * 60;
	let totalSeconds = timeLeft;
	let interval: ReturnType<typeof setInterval>;
	let idleSaveTimer: ReturnType<typeof setTimeout>;
	let buttonScales: Record<string, number> = {};

	onMount(() => {
		interval = setInterval(tick, 1000);
		scheduleIdleSave();
	});

	onDestroy(() => {
		clearInterval(interval);
		clearTimeout(idleSaveTimer);
	});

	function scheduleIdleSave() {
		clearTimeout(idleSaveTimer);
		idleSaveTimer = setTimeout(() => {
			void autosaveSession();
			scheduleIdleSave();
		}, IDLE_SAVE_MS);
	}

	function tick() {
		if (timeLeft > 0) {
			timeLeft -= 1;
		} else {
			clearInterval(interval);
			advance();
		}
	}

	function advance() {
		void autosaveSession();
		sessionStore.update((s) => ({ ...s, step: 'thankyou' }));
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

		void autosaveSession();
		scheduleIdleSave();

		// Animate button
		buttonScales[insect.name] = 0.93;
		setTimeout(() => {
			buttonScales[insect.name] = 1;
			buttonScales = { ...buttonScales };
		}, 120);
		buttonScales = { ...buttonScales };
	}

	function removeLastTap(insect: InsectType, event: MouseEvent) {
		event.stopPropagation();

		sessionStore.update((s) => {
			if ((s.counts[insect.name] ?? 0) <= 0) return s;

			const lastIndex = s.taps.map((t) => t.name).lastIndexOf(insect.name);
			const taps = s.taps.slice();
			if (lastIndex !== -1) taps.splice(lastIndex, 1);

			return {
				...s,
				counts: {
					...s.counts,
					[insect.name]: s.counts[insect.name] - 1
				},
				taps,
				totalCount: Math.max(0, s.totalCount - 1)
			};
		});

		void autosaveSession();
		scheduleIdleSave();
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
	<div class="grid grid-cols-3 gap-1.5">
		{#each insectTypes as insect}
			{@const count = $sessionStore.counts[insect.name] ?? 0}
			<div
				role="button"
				tabindex="0"
				class="relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-base-300 bg-base-200 transition-all"
				style="transform: scale({buttonScales[insect.name] ?? 1})"
				onclick={() => tapInsect(insect)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tapInsect(insect))}
			>
				{#if count > 0}
					<span class="absolute right-1 top-1 z-10 min-w-4 rounded-full bg-primary px-1 py-px text-center text-[8px] font-medium text-white">
						{count}
					</span>
					<button
						class="absolute left-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-[10px] font-medium leading-none text-white"
						aria-label={$_('observe.timer.undo')}
						onclick={(e) => removeLastTap(insect, e)}
					>
						−
					</button>
				{/if}
				<img src={insectImage(insect.name)} alt="" class="h-7 w-7" />
				<span class="px-1 text-center text-[9px] font-medium leading-tight text-base-content/70">{$_(`insect.${insect.name}`)}</span>
			</div>
		{/each}
	</div>

	<button class="btn btn-ghost btn-sm text-base-content/40" onclick={advance}>
		{$_('observe.timer.finish')}
	</button>
</div>
