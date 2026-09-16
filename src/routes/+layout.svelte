<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { writable } from 'svelte/store';
	import { setContext } from 'svelte';
	import { readLocalSessionIds, clearLocalSessionIds } from '$lib/localSessions';
	import { listLocalSnapshots, removeLocalSnapshot } from '$lib/session/snapshot';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	const authUser = writable(data.user);
	setContext('authUser', authUser);

	$: authUser.set(data.user);

	// Link any anonymous observations this device made before the observer
	// signed in — independent of the email-claim flow on the summary screen.
	onMount(() => {
		if (!data.user) return;
		const sessionIds = readLocalSessionIds();
		if (sessionIds.length === 0) return;

		fetch('/api/sessions/claim-local', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionIds })
		})
			.then((res) => {
				if (res.ok) clearLocalSessionIds();
			})
			.catch(() => {
				// offline — retried on the next authenticated page load
			});
	});

	// Push any session snapshot left behind by a crash, kill, or lost
	// connection on a previous visit — see $lib/session/snapshot +
	// $lib/session/sync. Same idempotent PUT as the live 30s sync, so a
	// completed snapshot whose earlier response never arrived is safe to
	// resend here. Best-effort; whatever doesn't land retries again on the
	// next app load. A completed snapshot is removed locally once the server
	// confirms it; an in-progress one is left in place (it isn't done yet).
	onMount(() => {
		for (const snapshot of listLocalSnapshots()) {
			fetch(`/api/sessions/${snapshot.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(snapshot)
			})
				.then((res) => {
					if (res.ok && snapshot.status === 'complete') removeLocalSnapshot(snapshot.id);
				})
				.catch(() => {
					// still offline — retried on the next app load
				});
		}
	});

	const tabs = [
		{
			href: '/observe',
			labelKey: 'nav.observe',
			svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path fill-rule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clip-rule="evenodd"/></svg>`
		},
		{
			href: '/sightings',
			labelKey: 'nav.sightings',
			svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path fill-rule="evenodd" d="M2.625 6.75a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875 0A.75.75 0 0 1 8.25 6h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75ZM2.625 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0ZM7.5 12a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 7.5 12Zm-4.875 5.25a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0ZM7.5 17.25a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd"/></svg>`
		},
		{
			href: '/explore',
			labelKey: 'nav.explore',
			svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path fill-rule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8.25 8.25 0 0 0-16.5 0c0 3.63 1.556 6.324 3.5 8.327a19.58 19.58 0 0 0 2.683 2.282 16.975 16.975 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd"/></svg>`
		},
		{
			href: '/profile',
			labelKey: 'nav.profile',
			svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M11.644 1.59a.75.75 0 0 1 .712 0l9.75 5.25a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.712 0l-9.75-5.25a.75.75 0 0 1 0-1.32l9.75-5.25Z"/><path d="m3.265 10.602 7.668 4.129a2.25 2.25 0 0 0 2.134 0l7.668-4.13 1.37.739a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.71 0l-9.75-5.25a.75.75 0 0 1 0-1.32l1.37-.738Z"/><path d="m10.933 19.231-7.668-4.13-1.37.739a.75.75 0 0 0 0 1.32l9.75 5.25c.221.12.489.12.71 0l9.75-5.25a.75.75 0 0 0 0-1.32l-1.37-.738-7.668 4.13a2.25 2.25 0 0 1-2.134-.001Z"/></svg>`
		}
	];

	$: currentPath = $page.url.pathname;

	function isActive(href: string, path: string) {
		return path === href || path.startsWith(href + '/');
	}

	/** Routes that own the whole frame (e.g. a fullscreen map editor) render without the tab bar or scroll chrome. */
	$: isFullscreenRoute = currentPath.startsWith('/space/boundary') || currentPath.startsWith('/spot/new');

	$: hideTabBar = isFullscreenRoute;
</script>

<div class="flex min-h-dvh flex-col items-center bg-muted">
	<div class="relative flex w-full max-w-[420px] flex-1 flex-col bg-background">
		<main class={isFullscreenRoute ? '' : 'flex-1 overflow-y-auto pb-24'}>
			<slot />
		</main>

		{#if !hideTabBar}
			<nav class="fixed bottom-0 left-1/2 w-full max-w-[420px] -translate-x-1/2 bg-background border-t border-border px-4 py-3">
				<div class="flex items-center justify-around gap-2">
					{#each tabs as tab}
						<button
							class="flex flex-1 items-center justify-center rounded-lg py-3 transition-colors {isActive(tab.href, currentPath)
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'}"
							onclick={() => goto(tab.href)}
							aria-label={$_(tab.labelKey)}
						>
							{@html tab.svg}
						</button>
					{/each}
				</div>
			</nav>
		{/if}
	</div>
</div>
