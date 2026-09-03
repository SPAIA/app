<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import LegalFooter from '$lib/components/LegalFooter.svelte';
	import { authClient } from '$lib/auth-client';

	const authUser = getContext<Writable<App.Locals['user']>>('authUser');

	let loggingOut = false;

	async function handleLogout() {
		loggingOut = true;
		await authClient.signOut();
		// Full reload so server load functions re-run without the session cookie.
		window.location.href = '/';
	}

	const steps = [
		{ emoji: '📍', titleKey: 'landing.how.step1.title', bodyKey: 'landing.how.step1.body' },
		{ emoji: '👆', titleKey: 'landing.how.step2.title', bodyKey: 'landing.how.step2.body' },
		{ emoji: '📈', titleKey: 'landing.how.step3.title', bodyKey: 'landing.how.step3.body' }
	];
</script>

<svelte:head>
	<title>{$_('app.name')} — {$_('landing.hero.headline')}</title>
	<meta name="description" content={$_('landing.hero.subheadline')} />
</svelte:head>

<div class="flex min-h-dvh flex-col overflow-y-auto">
	<div class="flex flex-1 flex-col gap-10 px-5 py-10">
		{#if $authUser}
			<div class="flex items-center justify-end gap-2 text-[11px] text-base-content/50">
				<span>{$_('landing.signedInAs', { values: { name: $authUser.name || $authUser.email } })}</span>
				<span>·</span>
				<button
					class="font-medium text-base-content/70 hover:text-base-content disabled:opacity-50"
					onclick={handleLogout}
					disabled={loggingOut}
				>
					{$_('profile.logout')}
				</button>
			</div>
		{/if}

		<!-- Hero -->
		<div class="flex flex-col items-center gap-4 pt-6 text-center">
			<span class="text-5xl">🐛</span>
			<h1 class="text-3xl font-semibold leading-tight text-base-content">{$_('landing.hero.headline')}</h1>
			<p class="text-base-content/70">{$_('landing.hero.subheadline')}</p>
			<span class="badge badge-neutral badge-outline mt-1">{$_('landing.stats.tagline')}</span>

			<div class="mt-4 flex w-full flex-col gap-2">
				<button class="btn btn-primary w-full" onclick={() => goto('/explore')}>
					{$_('landing.hero.cta.observe')}
				</button>
				{#if !$authUser}
					<button class="btn btn-ghost w-full" onclick={() => goto('/auth/login')}>
						{$_('landing.hero.cta.login')}
					</button>
				{/if}
			</div>
		</div>

		<!-- How it works -->
		<div class="flex flex-col gap-4">
			<h2 class="text-center text-sm font-semibold uppercase tracking-wide text-base-content/50">
				{$_('landing.how.title')}
			</h2>
			<div class="flex flex-col gap-3">
				{#each steps as step, i}
					<div class="flex gap-3 rounded-xl bg-base-200 p-4">
						<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-100 text-lg">
							{step.emoji}
						</span>
						<div class="flex flex-col">
							<span class="text-sm font-medium text-base-content">{i + 1}. {$_(step.titleKey)}</span>
							<span class="text-sm text-base-content/60">{$_(step.bodyKey)}</span>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Closing CTA -->
		<div class="flex flex-col items-center gap-3 rounded-2xl bg-base-content px-5 py-8 text-center">
			<h2 class="text-lg font-medium text-base-100">{$_('landing.cta.title')}</h2>
			<p class="text-sm text-base-100/70">{$_('landing.cta.body')}</p>
			<button class="btn btn-primary mt-1 w-full max-w-xs" onclick={() => goto('/explore')}>
				{$_('landing.cta.button')}
			</button>
		</div>

		<p class="text-center text-xs text-base-content/40">{$_('landing.footer.tagline')}</p>
	</div>

	<div class="px-5 pb-8">
		<LegalFooter />
	</div>
</div>
