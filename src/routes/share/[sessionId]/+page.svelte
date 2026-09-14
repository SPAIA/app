<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	export let data: PageData;

	$: session = data.session;
	$: sightings = data.sightings;
	$: image = data.image;
	$: url = $page.url.href;
	$: imageUrl = image ? `${$page.url.origin}/api/media/${image.id}` : null;

	async function saveAsImage() {
		const { default: html2canvas } = await import('html2canvas');
		const card = document.getElementById('share-card');
		if (!card) return;
		const canvas = await html2canvas(card, { scale: 2, useCORS: true });
		const link = document.createElement('a');
		link.download = `spaia-session.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
	}

	async function shareToStories() {
		if (navigator.share) {
			await navigator.share({ title: 'SPAIA session', url });
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(url);
	}
</script>

<svelte:head>
	<title>{$_('app.name')}{session.locality ? ` — ${session.total_count} sightings in ${session.locality}` : ''}</title>
	<meta property="og:title" content="SPAIA: {session.total_count} insects in {session.duration_min} min" />
	<meta property="og:description" content="{session.total_count} sightings{session.locality ? ` in ${session.locality}` : ''}. Join the insect observation network." />
	<meta property="og:url" content={url} />
	{#if imageUrl}
		<meta property="og:image" content={imageUrl} />
		<meta name="twitter:card" content="summary_large_image" />
	{/if}
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	<p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
		{$_('nav.profile')} · {$_('share.cta')}
	</p>

	<!-- Share card -->
	<div id="share-card" class="relative overflow-hidden rounded-2xl bg-foreground p-5">
		<div class="pointer-events-none absolute -right-5 -bottom-5 text-[120px] leading-none opacity-[0.06]">🐝</div>

		{#if imageUrl}
			<img src={imageUrl} alt="" class="mb-4 aspect-video w-full rounded-xl object-cover" crossorigin="anonymous" />
		{/if}

		<div class="mb-4 flex items-start justify-between">
			<div>
				<p class="text-[11px] font-medium uppercase tracking-wider text-white/60">
					{session.space_name ?? $_('app.name')}{session.locality ? ` · ${session.locality}` : ''}
				</p>
				<p class="text-[11px] text-white/40">
					{session.completed_at?.split('T')[0] ?? ''}
				</p>
			</div>
			{#if session.locality}
				<span class="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white">#4 {session.locality}</span>
			{/if}
		</div>

		<h2 class="mb-1 text-2xl font-medium leading-snug text-white">
			{session.total_count} creatures.<br>{session.duration_min} minutes.<br>Plain sight.
		</h2>
		<p class="mb-4 text-xs text-accent">{session.space_name ?? $_('app.name')} · Session</p>

		<!-- Stats -->
		<div class="mb-4 grid grid-cols-2 gap-2">
			<div class="rounded-lg bg-white/10 py-2.5 text-center">
				<div class="text-xl font-medium text-white">{session.total_count}</div>
				<div class="mt-0.5 text-[9px] uppercase tracking-wide text-white/50">{$_('share.stats.sightings')}</div>
			</div>
			<div class="rounded-lg bg-white/10 py-2.5 text-center">
				<div class="text-xl font-medium text-white">{sightings.length}</div>
				<div class="mt-0.5 text-[9px] uppercase tracking-wide text-white/50">{$_('share.stats.types')}</div>
			</div>
		</div>

		<!-- Finds pills -->
		<div class="mb-4 flex flex-wrap gap-1.5">
			{#each sightings as s}
				<span class="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] text-white">
					{s.insect_name} ×{s.count}
				</span>
			{/each}
		</div>

		<!-- Locality contribution -->
		{#if session.locality}
			<div class="mb-4 flex items-center justify-between rounded-lg bg-white/8 px-3 py-2.5">
				<div>
					<p class="text-[11px] text-white/50">{$_('share.locality.contribution', { values: { locality: session.locality } })}</p>
					<p class="text-sm font-medium text-white">+{session.total_count} sightings</p>
				</div>
				<span class="text-lg">📍</span>
			</div>
		{/if}

		<div class="flex items-center justify-between">
			<div class="text-[10px] leading-relaxed text-white/40">
				#{(session.space_name ?? session.locality ?? '').replace(/\s/g, '')}<br>#SPAIA
			</div>
			<div class="flex h-11 w-11 items-center justify-center rounded-md bg-white text-[10px] font-medium text-foreground">QR</div>
		</div>
	</div>

	<!-- Action buttons -->
	<div class="grid grid-cols-2 gap-2">
		<button class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background py-3 text-xs font-medium text-foreground" onclick={saveAsImage}>
			<span class="text-lg">🖼️</span>
			{$_('share.action.image')}
		</button>
		<button class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background py-3 text-xs font-medium text-foreground" onclick={shareToStories}>
			<span class="text-lg">📤</span>
			{$_('share.action.stories')}
		</button>
		<button class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background py-3 text-xs font-medium text-foreground" onclick={copyLink}>
			<span class="text-lg">📋</span>
			{$_('share.action.copy')}
		</button>
		<button class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background py-3 text-xs font-medium text-foreground">
			<span class="text-lg">💬</span>
			{$_('share.action.friend')}
		</button>
	</div>

	<p class="text-center text-[11px] text-muted-foreground">{$_('share.footer')}</p>
</div>
