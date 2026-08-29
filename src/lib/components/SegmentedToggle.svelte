<script lang="ts">
	export let value: string;
	export let options: { value: string; label: string; onSelect: () => void }[];
</script>

<div class="flex gap-2">
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="btn btn-sm flex-1"
			class:btn-primary={value === opt.value}
			class:btn-outline={value !== opt.value}
			onclick={opt.onSelect}
		>
			{opt.label}
		</button>
	{/each}
</div>
