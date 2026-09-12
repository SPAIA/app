<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { tick } from 'svelte';

	export let items: string[];
	export let addPlaceholder: string;
	export let removeLabel: string;
	export let onAdd: (value: string) => void;
	export let onRemove: (index: number) => void;
	export let chipClass = 'bg-base-200 text-base-content/70';
	export let chipRemoveClass = 'text-base-content/40 hover:text-base-content/70';

	let dialogEl: HTMLDialogElement;
	let inputEl: HTMLInputElement;
	let draft = '';

	async function openModal() {
		draft = '';
		dialogEl?.showModal();
		await tick();
		inputEl?.focus();
	}

	function closeModal() {
		dialogEl?.close();
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
		class="flex items-center justify-center rounded-full border border-dashed border-base-300 px-2.5 py-1 text-xs text-base-content/50 hover:border-base-content/40 hover:text-base-content/70"
		aria-label={addPlaceholder}
		onclick={openModal}
	>
		+
	</button>
</div>

<dialog bind:this={dialogEl} class="modal">
	<div class="modal-box">
		<h3 class="text-sm font-medium text-base-content">{addPlaceholder}</h3>
		<input
			bind:this={inputEl}
			type="text"
			class="input input-bordered mt-3 w-full"
			placeholder={addPlaceholder}
			bind:value={draft}
			onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
		/>
		<div class="modal-action">
			<button type="button" class="btn btn-sm" onclick={closeModal}>{$_('common.cancel')}</button>
			<button type="button" class="btn btn-sm btn-primary" onclick={submit} disabled={!draft.trim()}>
				{$_('common.add')}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={$_('common.cancel')}>close</button>
	</form>
</dialog>
