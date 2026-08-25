<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { sessionStore, resetSession } from '$lib/stores/session';
	import SetupStep from '$lib/components/SetupStep.svelte';
	import IntroStep from '$lib/components/IntroStep.svelte';
	import ObserveStep from '$lib/components/ObserveStep.svelte';
	import CardsStep from '$lib/components/CardsStep.svelte';
	import SummaryStep from '$lib/components/SummaryStep.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// A fresh page load always starts a fresh observation — guards against a
	// leftover in-memory session from a previously visited spot.
	onMount(() => resetSession());

	$: step = $sessionStore.step;
</script>

<svelte:head>
	<title>{data.spot.name} — {$_('app.name')}</title>
</svelte:head>

{#if step === 'setup'}
	<SetupStep spot={data.spot} />
{:else if step === 'intro'}
	<IntroStep insectTypes={data.insectTypes} />
{:else if step === 'observe'}
	<ObserveStep insectTypes={data.insectTypes} />
{:else if step === 'cards'}
	<CardsStep insectTypes={data.insectTypes} />
{:else if step === 'summary'}
	<SummaryStep />
{/if}
