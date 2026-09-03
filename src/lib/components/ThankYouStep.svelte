<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { sessionStore } from '$lib/stores/session';

	/** Quick add-time increments, in minutes. */
	const EXTEND_OPTIONS = [1, 3, 5];

	function addTime(minutes: number) {
		sessionStore.update((s) => ({
			...s,
			durationMin: minutes,
			totalDurationMin: s.totalDurationMin + minutes,
			step: 'observe'
		}));
	}

	function seeResults() {
		sessionStore.update((s) => ({ ...s, step: 'confirm' }));
	}
</script>

<div class="flex flex-col items-center gap-6 px-5 py-12 text-center">
	<span class="text-4xl">🙏</span>
	<div>
		<h1 class="text-lg font-medium text-base-content">{$_('thankyou.title')}</h1>
		<p class="mt-2 text-sm text-base-content/60">
			{$_('thankyou.body', { values: { count: $sessionStore.totalCount } })}
		</p>
	</div>

	<div class="flex w-full flex-col gap-2">
		<p class="text-xs font-medium uppercase tracking-widest text-base-content/40">
			{$_('thankyou.addTime.label')}
		</p>
		<div class="grid grid-cols-3 gap-2">
			{#each EXTEND_OPTIONS as minutes}
				<button class="btn btn-outline btn-sm" onclick={() => addTime(minutes)}>
					+{minutes}m
				</button>
			{/each}
		</div>
	</div>

	<button class="btn btn-primary w-full" onclick={seeResults}>
		{$_('thankyou.cta.results')}
	</button>
</div>
