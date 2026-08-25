<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';

	let loading = false;
	let redeeming = false;
	let showCodeInput = false;
	let code = '';
	let codeError = '';

	async function handleOrder() {
		loading = true;
		try {
			const res = await fetch('/api/stripe/create-checkout', { method: 'POST' });
			const data = await res.json() as { url?: string; error?: string };
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
			const res = await fetch('/api/space/create-free', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: code.trim() })
			});
			const data = await res.json() as { orderId?: string; error?: string };
			if (!res.ok || !data.orderId) {
				codeError = data.error ?? $_('space_pack.code.error');
				return;
			}
			goto(`/spot/new?order=${data.orderId}`);
		} finally {
			redeeming = false;
		}
	}

	const packItems = [
		{ icon: '🖼️', key: 'space_pack.item.poster' },
		{ icon: '📱', key: 'space_pack.item.qr' },
		{ icon: '📍', key: 'space_pack.item.listing' },
		{ icon: '📊', key: 'space_pack.item.dashboard' }
	];

	const steps = [
		{ key: 'space_pack.step.order' },
		{ key: 'space_pack.step.name' },
		{ key: 'space_pack.step.stick' },
		{ key: 'space_pack.step.watch' }
	];
</script>

<svelte:head>
	<title>{$_('space_pack.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-5 px-5 py-6">
	<!-- Hero -->
	<div class="relative overflow-hidden rounded-xl bg-[#0F6E56] px-5 py-6">
		<div class="pointer-events-none absolute -right-4 -bottom-4 text-[100px] leading-none opacity-[0.07]">🌿</div>
		<h1 class="text-2xl font-medium leading-tight text-white">{$_('space_pack.title')}</h1>
		<p class="mt-2 text-sm text-green-mid">{$_('space_pack.subtitle')}</p>
	</div>

	<!-- Pack contents -->
	<div class="rounded-xl border border-base-300 bg-base-200 p-4">
		<div class="flex flex-col gap-3">
			{#each packItems as item}
				<div class="flex items-start gap-3">
					<span class="mt-0.5 text-base">{item.icon}</span>
					<p class="text-sm text-base-content/70">{$_(item.key)}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- Price block -->
	<div class="flex items-baseline gap-2">
		<span class="text-4xl font-medium text-primary">{$_('space_pack.price')}</span>
		<span class="text-sm text-base-content/50">{$_('space_pack.shipping')}</span>
	</div>

	<!-- Steps -->
	<div class="flex">
		{#each steps as step, i}
			<div class="relative flex-1 text-center">
				{#if i < steps.length - 1}
					<span class="absolute right-[-6px] top-[10px] text-[11px] text-base-content/30">→</span>
				{/if}
				<div class="mx-auto mb-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-green-light text-[11px] font-medium text-primary">
					{i + 1}
				</div>
				<div class="text-[9px] leading-tight text-base-content/50">{$_(step.key)}</div>
			</div>
		{/each}
	</div>

	<button class="btn btn-primary w-full" onclick={handleOrder} disabled={loading}>
		{#if loading}<span class="loading loading-spinner loading-sm"></span>{/if}
		{$_('space_pack.cta')}
	</button>

	{#if !showCodeInput}
		<button class="btn btn-ghost btn-sm w-full" onclick={() => (showCodeInput = true)}>
			{$_('space_pack.code.link')}
		</button>
	{:else}
		<div class="flex flex-col gap-2">
			<div class="flex gap-2">
				<input
					class="input input-bordered input-sm flex-1"
					placeholder={$_('space_pack.code.placeholder')}
					bind:value={code}
					disabled={redeeming}
				/>
				<button class="btn btn-primary btn-sm" onclick={handleRedeemCode} disabled={redeeming || !code.trim()}>
					{#if redeeming}<span class="loading loading-spinner loading-xs"></span>{/if}
					{$_('space_pack.code.submit')}
				</button>
			</div>
			{#if codeError}
				<p class="text-xs text-error">{codeError}</p>
			{/if}
		</div>
	{/if}
</div>
