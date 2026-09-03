<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { sessionStore, resetSession } from '$lib/stores/session';
	import { resetSaveProgress } from '$lib/sessionSave';
	import SetupStep from '$lib/components/SetupStep.svelte';
	import ObserveStep from '$lib/components/ObserveStep.svelte';
	import ThankYouStep from '$lib/components/ThankYouStep.svelte';
	import SpotConfirmStep from '$lib/components/SpotConfirmStep.svelte';
	import CardsStep from '$lib/components/CardsStep.svelte';
	import SummaryStep from '$lib/components/SummaryStep.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// A fresh page load always starts a fresh observation — guards against a
	// leftover in-memory session from a previously visited spot.
	onMount(() => {
		resetSession();
		resetSaveProgress();
	});

	$: step = $sessionStore.step;
</script>

<svelte:head>
	<title>{data.spot.name} — {$_('app.name')}</title>
</svelte:head>

{#if step === 'setup'}
	<SetupStep spot={data.spot} cover={data.cover} />
{:else if step === 'observe'}
	<ObserveStep insectTypes={data.insectTypes} />
{:else if step === 'thankyou'}
	<ThankYouStep />
{:else if step === 'confirm'}
	<SpotConfirmStep />
{:else if step === 'cards'}
	<CardsStep insectTypes={data.insectTypes} />
{:else if step === 'summary'}
	<SummaryStep />
{/if}
