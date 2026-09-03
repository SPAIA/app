<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import LegalFooter from '$lib/components/LegalFooter.svelte';

	let activeTab: 'email' | 'magic' | 'signup' = 'email';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let loading = false;
	let error = '';
	let successMsg = '';

	$: next = $page.url.searchParams.get('next') ?? '/';
	$: if ($page.url.searchParams.get('error')) error = $page.url.searchParams.get('error') ?? '';

	async function handleEmailLogin() {
		loading = true;
		error = '';
		const { error: err } = await authClient.signIn.email({ email, password });
		loading = false;
		if (err) {
			error = err.message ?? 'Sign-in failed';
		} else {
			// Full reload so server load functions re-run with the new session cookie.
			window.location.href = next;
		}
	}

	async function handleSignUp() {
		if (password !== confirmPassword) {
			error = $_('auth.signup.error.mismatch');
			return;
		}
		loading = true;
		error = '';
		const { error: err } = await authClient.signUp.email({
			email,
			password,
			name: email.split('@')[0]
		});
		loading = false;
		if (err) {
			error = err.message ?? 'Sign-up failed';
		} else {
			// emailAndPassword sign-up signs the user in immediately (no verification step).
			window.location.href = next || '/profile';
		}
	}

	async function handleMagicLink() {
		loading = true;
		error = '';
		const callbackURL = new URL(next || '/profile', $page.url.origin).toString();
		const { error: err } = await authClient.signIn.magicLink({ email, callbackURL });
		loading = false;
		if (err) {
			error = err.status === 429
				? 'Too many requests — please wait a minute and try again.'
				: (err.message ?? 'Could not send magic link');
		} else {
			successMsg = $_('auth.login.success.magic');
		}
	}
</script>

<svelte:head>
	<title>{$_('auth.login.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex min-h-[80dvh] flex-col justify-center px-5 py-8">
	<div class="mb-8 text-center">
		<span class="text-4xl">🐛</span>
		<h1 class="mt-3 text-2xl font-medium text-base-content">{$_('auth.login.title')}</h1>
	</div>

	<div role="tablist" class="tabs tabs-boxed mb-6">
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'email'}
			onclick={() => { activeTab = 'email'; error = ''; successMsg = ''; }}
		>
			{$_('auth.login.tab.email')}
		</button>
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'magic'}
			onclick={() => { activeTab = 'magic'; error = ''; successMsg = ''; }}
		>
			{$_('auth.login.tab.magic')}
		</button>
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'signup'}
			onclick={() => { activeTab = 'signup'; error = ''; successMsg = ''; }}
		>
			{$_('auth.signup.tab')}
		</button>
	</div>

	{#if error}
		<div class="alert alert-error mb-4 text-sm">{error}</div>
	{/if}
	{#if successMsg}
		<div class="alert alert-success mb-4 text-sm">{successMsg}</div>
	{/if}

	{#if activeTab === 'email'}
		<div class="flex flex-col gap-3">
			<label class="form-control">
				<div class="label"><span class="label-text">{$_('auth.login.email')}</span></div>
				<input
					type="email"
					class="input input-bordered w-full"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
				/>
			</label>
			<label class="form-control">
				<div class="label"><span class="label-text">{$_('auth.login.password')}</span></div>
				<input
					type="password"
					class="input input-bordered w-full"
					bind:value={password}
					autocomplete="current-password"
				/>
			</label>
			<button
				class="btn btn-primary mt-2 w-full"
				onclick={handleEmailLogin}
				disabled={loading || !email || !password}
			>
				{#if loading}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$_('auth.login.submit.email')}
			</button>
		</div>
	{:else if activeTab === 'magic'}
		<div class="flex flex-col gap-3">
			<label class="form-control">
				<div class="label"><span class="label-text">{$_('auth.login.email')}</span></div>
				<input
					type="email"
					class="input input-bordered w-full"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
				/>
			</label>
			<button
				class="btn btn-primary mt-2 w-full"
				onclick={handleMagicLink}
				disabled={loading || !email}
			>
				{#if loading}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$_('auth.login.submit.magic')}
			</button>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			<label class="form-control">
				<div class="label"><span class="label-text">{$_('auth.login.email')}</span></div>
				<input
					type="email"
					class="input input-bordered w-full"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
				/>
			</label>
			<label class="form-control">
				<div class="label"><span class="label-text">{$_('auth.login.password')}</span></div>
				<input
					type="password"
					class="input input-bordered w-full"
					bind:value={password}
					autocomplete="new-password"
				/>
			</label>
			<label class="form-control">
				<div class="label"><span class="label-text">{$_('auth.signup.confirm')}</span></div>
				<input
					type="password"
					class="input input-bordered w-full"
					bind:value={confirmPassword}
					autocomplete="new-password"
				/>
			</label>
			<button
				class="btn btn-primary mt-2 w-full"
				onclick={handleSignUp}
				disabled={loading || !email || !password || !confirmPassword}
			>
				{#if loading}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$_('auth.signup.submit')}
			</button>
		</div>
	{/if}

	{#if activeTab !== 'signup'}
		<button class="btn btn-ghost mt-4 text-xs text-base-content/50" onclick={() => { activeTab = 'signup'; error = ''; successMsg = ''; }}>
			{$_('auth.login.no_account')}
		</button>
	{:else}
		<button class="btn btn-ghost mt-4 text-xs text-base-content/50" onclick={() => { activeTab = 'email'; error = ''; successMsg = ''; }}>
			{$_('auth.signup.have_account')}
		</button>
	{/if}

	<div class="mt-8">
		<LegalFooter />
	</div>
</div>
