<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { insectImage } from '$lib/insectImage';

	export let name: string;
	export let count: number;
</script>

<div class="flex items-center gap-2">
	<img src={insectImage(name)} alt="" class="h-6 w-6 shrink-0 object-contain" />
	<span class="flex-1 truncate text-sm text-foreground">{$_(`insect.${name}`)}</span>
	<span class="text-sm font-bold text-foreground">{count}</span>
</div>
