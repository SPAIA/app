<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { setBoundaryDraft, takeBoundaryResult } from '$lib/boundaryHandoff';
	import { formatArea } from '$lib/geo';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert';
	import { Spinner } from '$lib/components/ui/spinner';

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
			<Spinner size="lg" class="text-primary" />
		</div>
	{:else if verified}
		<h1 class="text-xl font-medium text-foreground">{$_('space.new.title')}</h1>

		{#if error}
			<Alert.Root variant="destructive" class="text-sm">{error}</Alert.Root>
		{/if}

		<div class="flex flex-col gap-1.5">
			<Label>{$_('space.new.name.label')}</Label>
			<Input
				type="text"
				placeholder={$_('space.new.name.placeholder')}
				bind:value={spaceName}
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<Label>{$_('space.new.description.label')}</Label>
			<Textarea
				rows={3}
				placeholder={$_('space.new.description.placeholder')}
				bind:value={description}
			></Textarea>
		</div>

		<div class="flex flex-col gap-2">
			<Label>{$_('space.new.boundary.label')}</Label>
			{#if boundary}
				<div class="flex items-center justify-between gap-2 rounded-xl border border-border px-4 py-3">
					<span class="text-sm text-muted-foreground">{formatArea(boundaryArea)}</span>
					<div class="flex gap-2">
						<Button type="button" variant="ghost" size="sm" onclick={openBoundaryEditor}>
							{$_('space.new.boundary.edit')}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="text-destructive"
							onclick={() => {
								boundary = null;
								boundaryArea = 0;
							}}
						>
							{$_('space.new.boundary.clear')}
						</Button>
					</div>
				</div>
			{:else}
				<Button type="button" variant="outline" class="w-full" onclick={openBoundaryEditor}>
					{$_('space.new.boundary.draw')}
				</Button>
			{/if}
		</div>

		<Button
			variant="default"
			class="w-full mt-2"
			onclick={handleCreate}
			disabled={submitting || !spaceName}
		>
			{#if submitting}<Spinner size="sm" />{/if}
			{$_('space.new.submit')}
		</Button>
	{/if}
</div>
