<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';

	export let items: string[];
	export let addPlaceholder: string;
	export let removeLabel: string;
	export let onAdd: (value: string) => void;
	export let onRemove: (index: number) => void;
	export let chipClass = 'bg-muted text-muted-foreground';
	export let chipRemoveClass = 'text-muted-foreground/70 hover:text-muted-foreground';

	let open = false;
	let inputEl: HTMLInputElement | null = null;
	let draft = '';

	async function openModal() {
		draft = '';
		open = true;
		await tick();
		inputEl?.focus();
	}

	function closeModal() {
		open = false;
	}

	function submit() {
		const value = draft.trim();
		if (!value) return;
		onAdd(value);
		closeModal();
	}
</script>

<div class="flex flex-wrap gap-1.5">
	{#each items as item, i}
		<span class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs {chipClass}">
			{item}
			<button type="button" class={chipRemoveClass} aria-label={removeLabel} onclick={() => onRemove(i)}>
				&times;
			</button>
		</span>
	{/each}
	<button
		type="button"
		class="flex items-center justify-center rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-muted-foreground hover:text-foreground"
		aria-label={addPlaceholder}
		onclick={openModal}
	>
		+
	</button>
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<h3 class="text-sm font-medium text-foreground">{addPlaceholder}</h3>
		<Input
			bind:ref={inputEl}
			type="text"
			class="mt-3"
			placeholder={addPlaceholder}
			bind:value={draft}
			onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
		/>
		<Dialog.Footer>
			<Button variant="secondary" size="sm" onclick={closeModal}>{$_('common.cancel')}</Button>
			<Button size="sm" onclick={submit} disabled={!draft.trim()}>
				{$_('common.add')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
