<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { sessionStore, resetSession } from '$lib/stores/session';

	let email = '';
	let submitting = false;
	let submitted = false;

	// The session is already persisted (anonymously) by the time we reach this
	// step — see SpotConfirmStep. Here the email only *claims* that saved session.
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
		<p class="text-lg font-medium leading-snug text-primary-content">{$_('close.headline')}</p>
		<p class="mt-2 text-sm text-primary-content/70">
			{$_('close.sub', { values: { count: $sessionStore.totalCount, duration: $sessionStore.totalDurationMin } })}
		</p>
	</div>

	<!-- Email capture -->
	{#if !submitted && !loggedIn}
		<div class="flex flex-col gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-4">
			<p class="text-sm font-medium text-base-content">{$_('email.cta')}</p>
			<input
				type="email"
				class="input input-bordered w-full text-sm"
				placeholder={$_('email.placeholder')}
				bind:value={email}
			/>
			<button
				class="btn btn-primary w-full"
				onclick={handleEmailSubmit}
				disabled={submitting || !email}
			>
				{#if submitting}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$_('email.submit')}
			</button>
			<button class="btn btn-ghost btn-sm text-base-content/40" onclick={handleSkip}>
				{$_('email.skip')}
			</button>
		</div>
	{:else}
		{#if email}
			<div class="rounded-xl border border-base-300 bg-base-100 px-4 py-4 text-center">
				<p class="text-sm font-medium text-base-content">Check your email</p>
				<p class="mt-1 text-xs text-base-content/50">We sent a magic link to <strong>{email}</strong> — click it to view your collection.</p>
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			{#if sessionId}
				<button class="btn btn-primary w-full" onclick={handleShare}>
					{$_('share.cta')}
				</button>
			{/if}
			<button class="btn btn-outline w-full" onclick={handleExplore}>
				{$_('cards.cta.explore')}
			</button>
		</div>
	{/if}
</div>
