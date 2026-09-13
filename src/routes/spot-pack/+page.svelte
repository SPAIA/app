<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';

	let loading = false;
	let redeeming = false;
	let showCodeInput = false;
	let code = '';
	let codeError = '';

	async function handleOrder() {
		loading = true;
		try {
			const res = await fetch('/api/stripe/create-checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cancelPath: '/spot-pack' })
			});
			const data = (await res.json()) as { url?: string; error?: string };
			if (data.url) {
				window.location.href = data.url;
			}
		} finally {
			loading = false;
		}
	}

	async function handleRedeemCode() {
		if (!code.trim()) return;
		redeeming = true;
		codeError = '';
		try {
			const res = await fetch('/api/spot/create-free', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: code.trim() })
			});
			const data = (await res.json()) as { orderId?: string; error?: string };
			if (!res.ok || !data.orderId) {
				codeError = data.error ?? $_('spot_pack.code.error');
				return;
			}
			goto(`/spot/new?order=${data.orderId}`);
		} finally {
			redeeming = false;
		}
	}

	const packItems = [
		{ icon: '📍', key: 'spot_pack.item.listing' },
		{ icon: '📊', key: 'spot_pack.item.dashboard' }
	];

	const steps = [
		{ key: 'spot_pack.step.order' },
		{ key: 'spot_pack.step.name' },
		{ key: 'spot_pack.step.watch' }
	];
</script>

<svelte:head>
	<title>{$_('spot_pack.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-5 px-5 py-6">
	<!-- Hero -->
	<div class="relative overflow-hidden rounded-xl bg-foreground px-5 py-6">
		<div class="pointer-events-none absolute -right-4 -bottom-4 text-[100px] leading-none opacity-[0.07]">📍</div>
		<h1 class="text-2xl font-medium leading-tight text-white">{$_('spot_pack.title')}</h1>
		<p class="mt-2 text-sm text-green-mid">{$_('spot_pack.subtitle')}</p>
	</div>

	<!-- Pack contents -->
	<div class="rounded-xl border border-border bg-muted p-4">
		<div class="flex flex-col gap-3">
			{#each packItems as item}
				<div class="flex items-start gap-3">
					<span class="mt-0.5 text-base">{item.icon}</span>
					<p class="text-sm text-muted-foreground">{$_(item.key)}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- Price block -->
	<div class="flex items-baseline gap-2">
		<span class="text-4xl font-medium text-primary">{$_('spot_pack.price')}</span>
		<span class="text-sm text-muted-foreground">{$_('spot_pack.shipping')}</span>
	</div>

	<!-- Steps -->
	<div class="flex">
		{#each steps as step, i}
			<div class="relative flex-1 text-center">
				{#if i < steps.length - 1}
					<span class="absolute right-[-6px] top-[10px] text-[11px] text-muted-foreground">→</span>
				{/if}
				<div class="mx-auto mb-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-green-light text-[11px] font-medium text-primary">
					{i + 1}
				</div>
				<div class="text-[9px] leading-tight text-muted-foreground">{$_(step.key)}</div>
			</div>
		{/each}
	</div>

	<Button variant="default" class="w-full" onclick={handleOrder} disabled={loading}>
		{#if loading}<Spinner size="sm" />{/if}
		{$_('spot_pack.cta')}
	</Button>

	{#if !showCodeInput}
		<Button variant="ghost" size="sm" class="w-full" onclick={() => (showCodeInput = true)}>
			{$_('spot_pack.code.link')}
		</Button>
	{:else}
		<div class="flex flex-col gap-2">
			<div class="flex gap-2">
				<Input
					class="h-8 text-sm flex-1"
					placeholder={$_('spot_pack.code.placeholder')}
					bind:value={code}
					disabled={redeeming}
				/>
				<Button variant="default" size="sm" onclick={handleRedeemCode} disabled={redeeming || !code.trim()}>
					{#if redeeming}<Spinner size="xs" />{/if}
					{$_('spot_pack.code.submit')}
				</Button>
			</div>
			{#if codeError}
				<p class="text-xs text-destructive">{codeError}</p>
			{/if}
		</div>
	{/if}
</div>
