<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { insectImage } from '$lib/insectImage';

	export let name: string;
	export let count: number;
</script>

<div class="relative flex flex-col items-center gap-1.5 rounded-xl border border-primary bg-green-light px-2 py-4">
	<img src={insectImage(name)} alt="" class="h-10 w-10 rounded-lg object-cover" />
	<span class="text-center text-[11px] font-medium text-base-content">{$_(`insect.${name}`)}</span>
	<span class="text-[10px] text-base-content/60">×{count}</span>
</div>
