<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { setBoundaryDraft, takeBoundaryResult } from '$lib/boundaryHandoff';
	import { formatArea } from '$lib/geo';

	let verified = false;
	let checking = true;
	let spaceOrderId = '';
	let spaceName = '';
	let description = '';

	let lat: number | null = null;
	let lng: number | null = null;
	let boundary: string | null = null;
	let boundaryArea = 0;

	let submitting = false;
	let error = '';

	function openBoundaryEditor() {
		setBoundaryDraft({ lat, lng, geojson: boundary, returnTo: $page.url.pathname + $page.url.search });
		goto('/space/boundary');
	}

	onMount(async () => {
		const boundaryResult = takeBoundaryResult();
		if (boundaryResult) {
			boundary = boundaryResult.geojson;
			boundaryArea = boundaryResult.areaM2;
			lat = boundaryResult.lat;
			lng = boundaryResult.lng;
		}

		const sessionId = $page.url.searchParams.get('order');
		if (!sessionId) {
			goto('/space-pack');
			return;
		}

		const res = await fetch(`/api/stripe/verify?session_id=${sessionId}`);
		const data = (await res.json()) as { paid: boolean; spaceOrderId: string };
		if (!data.paid) {
			goto('/space-pack');
			return;
		}

		spaceOrderId = data.spaceOrderId;
		verified = true;
		checking = false;
	});

	async function handleCreate() {
		if (!spaceName) return;
		submitting = true;
		error = '';

		const res = await fetch('/api/space/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				spaceName,
				description,
				lat,
				lng,
				spaceOrderId,
				boundaryGeojson: boundary
			})
		});

		if (!res.ok) {
			const d = (await res.json()) as { error?: string };
			error = d.error ?? 'Something went wrong.';
			submitting = false;
			return;
		}

		const data = (await res.json()) as { slug: string };
		goto(`/space/${data.slug}/dashboard`);
	}
</script>

<svelte:head>
	<title>{$_('space.new.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	{#if checking}
		<div class="flex items-center justify-center py-12">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{:else if verified}
		<h1 class="text-xl font-medium text-base-content">{$_('space.new.title')}</h1>

		{#if error}
			<div class="alert alert-error text-sm">{error}</div>
		{/if}

		<label class="form-control">
			<div class="label"><span class="label-text">{$_('space.new.name.label')}</span></div>
			<input
				type="text"
				class="input input-bordered w-full"
				placeholder={$_('space.new.name.placeholder')}
				bind:value={spaceName}
			/>
		</label>

		<label class="form-control">
			<div class="label"><span class="label-text">{$_('space.new.description.label')}</span></div>
			<textarea
				class="textarea textarea-bordered w-full"
				rows="3"
				placeholder={$_('space.new.description.placeholder')}
				bind:value={description}
			></textarea>
		</label>

		<div class="flex flex-col gap-2">
			<div class="label pb-0"><span class="label-text">{$_('space.new.boundary.label')}</span></div>
			{#if boundary}
				<div class="flex items-center justify-between gap-2 rounded-xl border border-base-300 px-4 py-3">
					<span class="text-sm text-base-content/70">{formatArea(boundaryArea)}</span>
					<div class="flex gap-2">
						<button type="button" class="btn btn-ghost btn-sm" onclick={openBoundaryEditor}>
							{$_('space.new.boundary.edit')}
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm text-error"
							onclick={() => {
								boundary = null;
								boundaryArea = 0;
							}}
						>
							{$_('space.new.boundary.clear')}
						</button>
					</div>
				</div>
			{:else}
				<button type="button" class="btn btn-outline w-full" onclick={openBoundaryEditor}>
					{$_('space.new.boundary.draw')}
				</button>
			{/if}
		</div>

		<button
			class="btn btn-primary w-full mt-2"
			onclick={handleCreate}
			disabled={submitting || !spaceName}
		>
			{#if submitting}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$_('space.new.submit')}
		</button>
	{/if}
</div>
