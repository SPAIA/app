<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { sessionStore } from '$lib/stores/session';
	import { nowISO } from '$lib/time';
	import { autosaveSession, undoTap } from '$lib/sessionSave';
	import { insectImage } from '$lib/insectImage';
	import type { InsectType } from '$lib/types';
	import { Button } from '$lib/components/ui/button';

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

	function adjustTime(deltaMinutes: number) {
		timeLeft = Math.max(0, timeLeft + deltaMinutes * 60);
		if (timeLeft > totalSeconds) totalSeconds = timeLeft;
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

		// Tells the server to remove the row if the undone tap had already been
		// autosaved (a no-op otherwise — see $lib/sessionSave.undoTap), then
		// flushes anything else still pending as usual.
		void undoTap(insect.name, $sessionStore.spotId);
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

<div class="relative flex flex-col">
	<!-- Timer display: sticky so it stays visible while the insect grid scrolls beneath it -->
	<div class="sticky top-0 z-20 bg-background px-5 pb-4 pt-6">
		<div class="rounded-xl border border-border bg-muted p-4 text-center">
			<div class="flex items-center justify-between gap-3">
				<Button
					variant="ghost"
					size="sm"
					class="shrink-0"
					aria-label={$_('observe.timer.minus')}
					onclick={() => adjustTime(-1)}
				>
					−1 min
				</Button>
				<div class="font-mono text-4xl font-medium text-primary">{formatTime(timeLeft)}</div>
				<Button
					variant="ghost"
					size="sm"
					class="shrink-0"
					aria-label={$_('observe.timer.plus')}
					onclick={() => adjustTime(1)}
				>
					+1 min
				</Button>
			</div>
			<div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
				<div
					class="h-full rounded-full bg-primary transition-all duration-1000"
					style="width: {progressPercent}%"
				></div>
			</div>
		</div>

		<!-- Running totals -->
		<div class="mt-4 flex justify-center gap-6 text-sm">
			<span class="text-muted-foreground">
				{$_('observe.timer.total')}:
				<strong class="text-foreground">{$sessionStore.totalCount}</strong>
			</span>
		</div>

		<!-- Sync status: never let the observer believe a count is safely saved when it isn't yet. -->
		{#if $sessionStore.syncStatus === 'error'}
			<p class="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
				{$_('observe.sync.error')}
			</p>
		{:else if $sessionStore.syncStatus === 'pending'}
			<p class="mt-2 text-center text-xs text-muted-foreground">
				{$_('observe.sync.saving')}
			</p>
		{/if}
	</div>

	<div class="flex flex-col gap-4 px-5 pb-6">
		<!-- Insect grid -->
		<div class="grid grid-cols-3 gap-1.5">
			{#each insectTypes as insect}
				{@const count = $sessionStore.counts[insect.name] ?? 0}
				<div
					role="button"
					tabindex="0"
					class="relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-border bg-muted transition-all"
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
					<img src={insectImage(insect.name)} alt="" class="h-16 w-16" />
					<span class="px-1 text-center text-xs font-medium leading-tight text-muted-foreground">{$_(`insect.${insect.name}`)}</span>
				</div>
			{/each}
		</div>

		<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={advance}>
			{$_('observe.timer.finish')}
		</Button>
	</div>
</div>
