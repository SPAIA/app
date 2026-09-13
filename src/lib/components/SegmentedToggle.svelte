<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	export let value: string;
	export let options: { value: string; label: string; onSelect: () => void }[];
</script>

<div class="flex gap-2">
	{#each options as opt (opt.value)}
		<Button
			type="button"
			class="flex-1"
			variant={value === opt.value ? 'default' : 'outline'}
			size="sm"
			onclick={opt.onSelect}
		>
			{opt.label}
		</Button>
	{/each}
</div>
