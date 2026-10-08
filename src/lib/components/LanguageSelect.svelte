<script lang="ts">
	import { locale } from 'svelte-i18n';
	import * as Select from '$lib/components/ui/select';

	/** Compact shows just the code ("DE") in the trigger — for page corners rather than settings rows. */
	let { compact = false }: { compact?: boolean } = $props();

	const languages = [
		{ code: 'en', label: 'English' },
		{ code: 'de', label: 'Deutsch' },
		{ code: 'nl', label: 'Nederlands' }
	];

	// Same key +layout.ts reads on load, so the choice sticks across visits.
	function setLanguage(code: string) {
		locale.set(code);
		localStorage.setItem('locale', code);
	}
</script>

<Select.Root type="single" value={$locale ?? undefined} onValueChange={(v) => v && setLanguage(v)}>
	<Select.Trigger size="sm" aria-label="Language">
		{#if compact}
			<span class="font-medium uppercase">{$locale}</span>
		{:else}
			{languages.find((lang) => lang.code === $locale)?.label ?? $locale}
		{/if}
	</Select.Trigger>
	<Select.Content>
		{#each languages as lang}
			<Select.Item value={lang.code} label={lang.label}>{lang.label}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
