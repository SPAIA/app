<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import LegalFooter from '$lib/components/LegalFooter.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Spinner } from '$lib/components/ui/spinner';

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
		<h1 class="mt-3 text-2xl font-medium text-foreground">{$_('auth.login.title')}</h1>
	</div>

	<Tabs.Root
		value={activeTab}
		onValueChange={(v) => { activeTab = v as typeof activeTab; error = ''; successMsg = ''; }}
		class="mb-6"
	>
		<Tabs.List class="w-full">
			<Tabs.Trigger value="email" class="flex-1">{$_('auth.login.tab.email')}</Tabs.Trigger>
			<Tabs.Trigger value="magic" class="flex-1">{$_('auth.login.tab.magic')}</Tabs.Trigger>
			<Tabs.Trigger value="signup" class="flex-1">{$_('auth.signup.tab')}</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	{#if error}
		<Alert.Root variant="destructive" class="mb-4 text-sm">{error}</Alert.Root>
	{/if}
	{#if successMsg}
		<Alert.Root class="mb-4 text-sm border-primary/30 bg-primary/10 text-primary">{successMsg}</Alert.Root>
	{/if}

	{#if activeTab === 'email'}
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1.5">
				<Label>{$_('auth.login.email')}</Label>
				<Input
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>{$_('auth.login.password')}</Label>
				<Input
					type="password"
					bind:value={password}
					autocomplete="current-password"
				/>
			</div>
			<Button
				class="mt-2 w-full"
				onclick={handleEmailLogin}
				disabled={loading || !email || !password}
			>
				{#if loading}<Spinner size="sm" />{/if}
				{$_('auth.login.submit.email')}
			</Button>
		</div>
	{:else if activeTab === 'magic'}
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1.5">
				<Label>{$_('auth.login.email')}</Label>
				<Input
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
				/>
			</div>
			<Button
				class="mt-2 w-full"
				onclick={handleMagicLink}
				disabled={loading || !email}
			>
				{#if loading}<Spinner size="sm" />{/if}
				{$_('auth.login.submit.magic')}
			</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1.5">
				<Label>{$_('auth.login.email')}</Label>
				<Input
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>{$_('auth.login.password')}</Label>
				<Input
					type="password"
					bind:value={password}
					autocomplete="new-password"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>{$_('auth.signup.confirm')}</Label>
				<Input
					type="password"
					bind:value={confirmPassword}
					autocomplete="new-password"
				/>
			</div>
			<Button
				class="mt-2 w-full"
				onclick={handleSignUp}
				disabled={loading || !email || !password || !confirmPassword}
			>
				{#if loading}<Spinner size="sm" />{/if}
				{$_('auth.signup.submit')}
			</Button>
		</div>
	{/if}

	{#if activeTab !== 'signup'}
		<Button variant="ghost" class="mt-4 text-xs text-muted-foreground" onclick={() => { activeTab = 'signup'; error = ''; successMsg = ''; }}>
			{$_('auth.login.no_account')}
		</Button>
	{:else}
		<Button variant="ghost" class="mt-4 text-xs text-muted-foreground" onclick={() => { activeTab = 'email'; error = ''; successMsg = ''; }}>
			{$_('auth.signup.have_account')}
		</Button>
	{/if}

	<div class="mt-8">
		<LegalFooter />
	</div>
</div>
