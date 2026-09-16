<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { sessionStore, resetSession } from '$lib/stores/session';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';

	let email = '';
	let submitting = false;
	let submitted = false;

	// The session is already persisted (anonymously) by the time we reach this
	// step — see CardsStep. Here the email only *claims* that saved session.
	$: sessionId = $sessionStore.sessionId;
	$: loggedIn = !!$page.data.user;

	async function handleEmailSubmit() {
		if (!email || !sessionId) return;
		submitting = true;
		try {
			await fetch('/api/sessions/claim', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId, email })
			});
		} catch {
			// non-blocking — show success anyway
		}
		submitted = true;
		submitting = false;
	}

	function handleSkip() {
		// Nothing to save — the session is already stored anonymously.
		submitted = true;
	}

	function handleShare() {
		if (sessionId) {
			goto(`/share/${sessionId}`);
		}
	}

	function handleExplore() {
		resetSession();
		goto('/explore');
	}
</script>

<div class="flex flex-col gap-5 px-5 py-6">
	<!-- Hero -->
	<div class="rounded-xl bg-primary px-5 py-5 text-center">
		<p class="text-lg font-medium leading-snug text-primary-foreground">{$_('close.headline')}</p>
		<p class="mt-2 text-sm text-primary-foreground/70">
			{$_('close.sub', { values: { count: $sessionStore.totalCount, duration: $sessionStore.totalDurationMin } })}
		</p>
	</div>

	<!-- The final save (completeSession, in CardsStep) may not have reached the
	     server — don't let this screen imply the count is safely stored when it
	     might only be on this device. It's still queued: the app retries on the
	     next tap/heartbeat and again on the next app load (see +layout.svelte). -->
	{#if $sessionStore.syncStatus === 'error'}
		<p class="rounded-lg bg-destructive/10 px-3 py-2.5 text-center text-sm text-destructive">
			{$_('close.notSynced')}
		</p>
	{/if}

	<!-- Email capture -->
	{#if !submitted && !loggedIn}
		<div class="flex flex-col gap-3 rounded-xl border border-border bg-background px-4 py-4">
			<p class="text-sm font-medium text-foreground">{$_('email.cta')}</p>
			<Input
				type="email"
				class="text-sm"
				placeholder={$_('email.placeholder')}
				bind:value={email}
			/>
			<Button
				variant="default"
				class="w-full"
				onclick={handleEmailSubmit}
				disabled={submitting || !email}
			>
				{#if submitting}<Spinner size="sm" />{/if}
				{$_('email.submit')}
			</Button>
			<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={handleSkip}>
				{$_('email.skip')}
			</Button>
		</div>
	{:else}
		{#if email}
			<div class="rounded-xl border border-border bg-background px-4 py-4 text-center">
				<p class="text-sm font-medium text-foreground">Check your email</p>
				<p class="mt-1 text-xs text-muted-foreground">We sent a magic link to <strong>{email}</strong> — click it to view your sightings.</p>
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			{#if sessionId}
				<Button variant="default" class="w-full" onclick={handleShare}>
					{$_('share.cta')}
				</Button>
			{/if}
			<Button variant="outline" class="w-full" onclick={handleExplore}>
				{$_('cards.cta.explore')}
			</Button>
		</div>
	{/if}
</div>
