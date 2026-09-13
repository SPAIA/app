<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { insectImage } from '$lib/insectImage';

	export let name: string;
	export let count: number;
	/** Historical avg sightings of this species here, scaled to this session's length — null when there's no history yet. */
	export let avg: number | null = null;
</script>

<div class="relative flex flex-col items-center gap-1.5 rounded-xl border border-primary bg-accent px-2 py-4">
	<img src={insectImage(name)} alt="" class="h-10 w-10 rounded-lg object-cover" />
	<span class="text-center text-[11px] font-medium text-foreground">{$_(`insect.${name}`)}</span>
	<span class="text-[10px] text-muted-foreground">×{count}</span>
	{#if avg != null}
		<span class="text-[9px] text-muted-foreground">{$_('cards.card.avg', { values: { avg: avg.toFixed(1) } })}</span>
	{/if}
</div>
