<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { insectImage } from '$lib/insectImage';
	import { Spinner } from '$lib/components/ui/spinner';

	export let data: PageData;

	$: session = data.session;
	/** One row per species (count summed) — see getSessionSightingsAggregated. */
	$: sightings = data.sightings;
	$: image = data.image;
	$: url = $page.url.href;
	$: imageUrl = image ? `${$page.url.origin}/api/media/${image.id}` : null;
	$: topSighting = sightings[0] ?? null;

	type Action = 'image' | 'share' | 'copy';
	let busy: Action | null = null;
	/** The action that just succeeded, with its confirmation label — cleared after a moment. */
	let done: { action: Action; label: string } | null = null;
	let doneTimer: ReturnType<typeof setTimeout> | undefined;

	function confirm(action: Action, label: string) {
		clearTimeout(doneTimer);
		done = { action, label };
		doneTimer = setTimeout(() => (done = null), 2000);
	}

	async function run(action: Action, fn: () => Promise<string | null>) {
		if (busy) return;
		busy = action;
		try {
			const label = await fn();
			if (label) confirm(action, label);
		} finally {
			busy = null;
		}
	}

	async function saveAsImage() {
		const { default: html2canvas } = await import('html2canvas');
		const card = document.getElementById('share-card');
		if (!card) return null;
		const canvas = await html2canvas(card, { scale: 2, useCORS: true });
		const link = document.createElement('a');
		link.download = `spaia-session.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
		return $_('share.action.saved');
	}

	async function share() {
		// No Web Share API (most desktop browsers) — copying the link is the closest equivalent.
		if (!navigator.share) return copyLink();
		try {
			await navigator.share({ title: 'SPAIA session', url });
			return $_('share.action.shared');
		} catch {
			// Dismissing the share sheet rejects with AbortError — not worth a confirmation.
			return null;
		}
	}

	async function copyLink() {
		await navigator.clipboard.writeText(url);
		return $_('share.action.copied');
	}

	const actions: { action: Action; icon: string; label: string; fn: () => Promise<string | null> }[] = [
		{ action: 'image', icon: '🖼️', label: 'share.action.image', fn: saveAsImage },
		{ action: 'share', icon: '📤', label: 'share.action.share', fn: share },
		{ action: 'copy', icon: '📋', label: 'share.action.copy', fn: copyLink }
	];
</script>

<svelte:head>
	<title>{$_('app.name')}{session.locality ? ` — ${session.total_count} sightings in ${session.locality}` : ''}</title>
	<meta property="og:title" content="SPAIA: {session.total_count} insects in {session.duration_min} min" />
	<meta property="og:description" content="{session.total_count} sightings{session.locality ? ` in ${session.locality}` : ''}. Join the insect observation network." />
	<meta property="og:url" content={url} />
</svelte:head>

<div class="flex flex-col gap-4 px-5 py-6">
	<a href="/sightings" class="self-start text-xs text-muted-foreground">
		← {$_('share.back')}
	</a>

	<!-- Share card — a fixed navy/mint brand look, independent of the viewer's light/dark
	     theme (this is a shareable graphic, not an app screen: it needs to read the same
	     way wherever it lands). -->
	<div id="share-card" class="relative overflow-hidden rounded-2xl bg-[#0C2464] p-5">
		{#if topSighting}
			<img
				src={insectImage(topSighting.name)}
				alt=""
				class="pointer-events-none absolute -right-8 -bottom-8 h-40 w-40 object-contain opacity-[0.08]"
			/>
		{/if}

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
		</div>

		<!-- The count is the reward — same framing as the post-count screen. -->
		<div class="relative mb-4 text-center">
			<div class="spaia-display text-[#3CF4A2]">{session.total_count}</div>
			<p class="mt-1 text-sm text-white/70">
				{$_('share.hero.sub', { values: { duration: session.duration_min } })}
			</p>
		</div>

		{#if sightings.length}
			<div class="relative mb-4 flex flex-col gap-2 rounded-xl bg-white/8 p-3">
				<p class="text-[10px] font-medium uppercase tracking-widest text-white/50">
					{$_('cards.whatYouCounted')}
				</p>
				<div class="grid grid-cols-2 gap-x-3 gap-y-2">
					{#each sightings as s}
						<div class="flex items-center gap-1.5">
							<img src={insectImage(s.name)} alt="" class="h-5 w-5 shrink-0 object-contain" />
							<span class="flex-1 truncate text-xs text-white">{$_(`insect.${s.name}`)}</span>
							<span class="text-xs font-bold text-white">{s.count}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Locality contribution -->
		{#if session.locality}
			<div class="relative mb-4 flex items-center justify-between rounded-lg bg-white/8 px-3 py-2.5">
				<div>
					<p class="text-[11px] text-white/50">{$_('share.locality.contribution', { values: { locality: session.locality } })}</p>
					<p class="text-sm font-medium text-white">+{session.total_count} {$_('share.stats.sightings')}</p>
				</div>
				<span class="text-lg">📍</span>
			</div>
		{/if}

		<div class="relative flex items-center justify-between">
			<div class="text-[10px] leading-relaxed text-white/40">
				#{(session.space_name ?? session.locality ?? '').replace(/\s/g, '')}<br>#SPAIA
			</div>
			<div class="rounded-md bg-white p-1">
				<img src={data.qrDataUrl} alt="" class="block h-14 w-14" />
			</div>
		</div>
	</div>

	<!-- Action buttons -->
	<div class="grid grid-cols-3 gap-2">
		{#each actions as { action, icon, label, fn } (action)}
			{@const isDone = done?.action === action}
			<button
				type="button"
				class="flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-[transform,background-color,border-color] duration-150 active:scale-95 active:bg-muted disabled:opacity-60 {isDone
					? 'border-primary bg-primary/10 text-primary'
					: 'border-border bg-background text-foreground'}"
				disabled={busy != null && busy !== action}
				aria-busy={busy === action}
				onclick={() => run(action, fn)}
			>
				<span class="flex h-7 items-center text-lg">
					{#if busy === action}
						<Spinner size="sm" />
					{:else if isDone}
						✓
					{:else}
						{icon}
					{/if}
				</span>
				<span aria-live="polite">{isDone ? done?.label : $_(label)}</span>
			</button>
		{/each}
	</div>

	<p class="text-center text-[11px] text-muted-foreground">{$_('share.footer')}</p>
</div>
