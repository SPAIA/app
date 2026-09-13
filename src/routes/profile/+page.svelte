<script lang="ts">
	import { _, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { LEVEL_TITLE_KEYS } from '$lib/gamification';
	import { authClient } from '$lib/auth-client';
	import LegalFooter from '$lib/components/LegalFooter.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { PageData } from './$types';

	export let data: PageData;

	let loggingOut = false;

	const languages = [
		{ code: 'en', label: 'English' },
		{ code: 'de', label: 'Deutsch' },
		{ code: 'nl', label: 'Nederlands' }
	];

	function setLanguage(code: string) {
		locale.set(code);
		localStorage.setItem('locale', code);
	}

	async function handleLogout() {
		loggingOut = true;
		await authClient.signOut();
		// Full reload so server load functions re-run without the session cookie.
		window.location.href = '/';
	}

	$: profile = data.profile;
	$: level = profile?.level ?? 1;
	$: levelTitleKey = LEVEL_TITLE_KEYS[level - 1] ?? LEVEL_TITLE_KEYS[0];
	$: totalSightings = data.sessions.reduce((sum, s) => sum + s.total_count, 0);

	// Group sightings by space
	$: spaceMap = data.collection.reduce<Record<number, { space_id: number; space_name: string; space_icon: string; space_slug: string; sightings: typeof data.collection }>>((acc, row) => {
		if (!acc[row.space_id]) {
			acc[row.space_id] = { space_id: row.space_id, space_name: row.space_name, space_icon: row.space_icon, space_slug: row.space_slug, sightings: [] };
		}
		acc[row.space_id].sightings.push(row);
		return acc;
	}, {});
	$: locationSets = Object.values(spaceMap);

	// Streak days display (7-day bar)
	$: streakDays = profile?.streak_days ?? 0;
	$: streakDayStates = Array.from({ length: 7 }, (_, i) => {
		if (i < streakDays - 1) return 'done';
		if (i === streakDays - 1) return 'today';
		return 'empty';
	});

	$: lastSession = data.sessions[0];
</script>

<svelte:head>
	<title>{$_('collection.title')} — {$_('app.name')}</title>
</svelte:head>

{#if !profile}
	<div class="flex flex-col gap-4 px-5 py-12 text-center">
		<span class="text-5xl">🐛</span>
		<p class="text-muted-foreground">{$_('collection.anon.prompt')}</p>
		<Button class="mx-auto" onclick={() => goto('/auth/login')}>
			{$_('collection.anon.cta')}
		</Button>
		<LegalFooter />
	</div>
{:else}
	<div class="flex flex-col gap-4 px-5 py-6">
		<!-- Collection header -->
		<div class="flex items-center gap-3 rounded-xl bg-foreground p-4">
			<button
				onclick={() => goto('/profile/edit')}
				class="shrink-0 overflow-hidden rounded-full ring-2 ring-white/30 focus:outline-none"
				aria-label={$_('profile.edit')}
			>
				{#if profile.avatar_url}
					<img src={profile.avatar_url} alt="avatar" class="h-11 w-11 object-cover" />
				{:else}
					<div class="flex h-11 w-11 items-center justify-center bg-white/20 text-2xl">🐛</div>
				{/if}
			</button>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-medium text-white">{profile.display_name ?? 'Bugmeister'}</p>
				<p class="text-[11px] text-green-mid">{$_(levelTitleKey)}{profile.home_locality ? ` · ${profile.home_locality}` : ''}</p>
			</div>
			<button
				onclick={() => goto('/profile/edit')}
				class="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white"
			>
				Lv. {level}
			</button>
		</div>

		<!-- Global stats -->
		<div class="grid grid-cols-3 gap-2">
			<div class="rounded-xl border border-border bg-background py-3 text-center">
				<div class="text-lg font-medium text-primary">{totalSightings}</div>
				<div class="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{$_('collection.stats.sightings')}</div>
			</div>
			<div class="rounded-xl border border-border bg-background py-3 text-center">
				<div class="text-lg font-medium text-primary">{locationSets.length}</div>
				<div class="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{$_('collection.stats.locations')}</div>
			</div>
			<div class="rounded-xl border border-border bg-background py-3 text-center">
				<div class="text-lg font-medium text-primary">{data.collection.length}</div>
				<div class="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{$_('collection.stats.types')}</div>
			</div>
		</div>

		<!-- Streak bar -->
		<div class="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3">
			<span class="shrink-0 text-3xl font-medium text-primary">{streakDays}</span>
			<div class="flex-1">
				<p class="text-sm font-medium text-foreground">{$_('collection.streak.label')}</p>
				<p class="text-[10px] text-muted-foreground">{$_('collection.streak.sub')}</p>
				<div class="mt-1.5 flex gap-1">
					{#each streakDayStates as state}
						<div
							class="flex h-5 w-5 items-center justify-center rounded text-[9px]"
							class:bg-primary={state === 'done' || state === 'today'}
							class:text-white={state === 'done' || state === 'today'}
							class:ring-2={state === 'today'}
							class:ring-[#0F6E56]={state === 'today'}
							class:bg-green-light={state === 'empty'}
						>
							{#if state !== 'empty'}✓{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Location sets -->
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium text-foreground">{$_('collection.locations.title')}</p>
			<button class="text-[11px] text-primary">{$_('collection.locations.see_all')}</button>
		</div>

		{#each locationSets as set}
			<div class="overflow-hidden rounded-xl border border-border bg-background">
				<div class="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
					<span class="text-xl">{set.space_icon}</span>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground">{set.space_name}</p>
						<p class="text-[10px] text-muted-foreground">{set.sightings.length} types found</p>
					</div>
					<span class="shrink-0 text-xs font-medium text-primary">
						{set.sightings.reduce((sum, s) => sum + s.count, 0)} sightings
					</span>
				</div>
				<div class="flex gap-1.5 overflow-x-auto px-3 py-2.5 scrollbar-none">
					{#each set.sightings as sighting}
						<div class="flex w-16 shrink-0 flex-col items-center gap-1 rounded-[10px] border border-primary bg-green-light px-1.5 py-2.5">
							<span class="text-xl">{sighting.icon}</span>
							<span class="text-center text-[8px] font-medium leading-tight text-muted-foreground">{$_(`insect.${sighting.insect_name}`)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}

		{#if lastSession}
			<Button class="w-full" onclick={() => goto(`/share/${lastSession.id}`)}>
				{$_('collection.cta.share')}
			</Button>
		{/if}

		<!-- Owned spots -->
		{#if data.spots.length > 0}
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-foreground">{$_('profile.spaces.title')}</p>
			</div>

			<div class="overflow-hidden rounded-xl border border-border bg-background">
				<div class="flex flex-col divide-y divide-border">
					{#each data.spots as spot}
						<div class="flex items-center gap-2.5 px-3.5 py-2.5">
							<span class="text-base">{spot.icon}</span>
							<span class="flex-1 min-w-0 truncate text-xs text-muted-foreground">{spot.name}</span>
							<a href="/space/{spot.space_slug}/spot/{spot.slug}/edit" class="shrink-0 text-[11px] font-medium text-primary">
								{$_('profile.spaces.edit')}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Language selector -->
		<div class="flex items-center justify-between rounded-xl border border-border bg-background px-3.5 py-3">
			<p class="text-sm font-medium text-foreground">{$_('profile.language.label')}</p>
			<Select.Root type="single" value={$locale ?? undefined} onValueChange={(v) => v && setLanguage(v)}>
				<Select.Trigger size="sm">
					{languages.find((lang) => lang.code === $locale)?.label ?? $locale}
				</Select.Trigger>
				<Select.Content>
					{#each languages as lang}
						<Select.Item value={lang.code} label={lang.label}>{lang.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<Button variant="outline" class="w-full" onclick={handleLogout} disabled={loggingOut}>
			{#if loggingOut}<Spinner size="sm" />{/if}
			{$_('profile.logout')}
		</Button>

		<p class="text-center text-[11px] text-muted-foreground">{$_('collection.footer')}</p>
		<LegalFooter />
	</div>
{/if}
