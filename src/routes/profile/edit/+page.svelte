<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert';
	import { Spinner } from '$lib/components/ui/spinner';

	export let data: PageData;
	export let form: ActionData;

	let displayName = data.profile.display_name ?? '';
	let bio = data.profile.bio ?? '';
	let avatarUrl = data.profile.avatar_url ?? '';
	let avatarPreview = data.profile.avatar_url ?? '';

	let uploading = false;
	let uploadError = '';
	let fileInput: HTMLInputElement;

	async function handleAvatarChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		uploading = true;
		uploadError = '';

		// Show local preview immediately
		avatarPreview = URL.createObjectURL(file);

		const body = new FormData();
		body.append('file', file);
		const res = await fetch('/api/avatar', { method: 'POST', body });

		if (!res.ok) {
			const detail = await res.json().catch(() => ({ message: 'Upload failed' }));
			uploadError = detail.message ?? 'Upload failed';
			uploading = false;
			return;
		}

		const { url } = (await res.json()) as { url: string };
		avatarUrl = url;
		avatarPreview = url;
		uploading = false;
	}
</script>

<svelte:head>
	<title>{$_('profile.title')} — {$_('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-5 px-5 py-6">
	<h1 class="text-lg font-medium text-foreground">{$_('profile.title')}</h1>

	{#if form?.success}
		<Alert.Root class="text-sm border-primary/30 bg-primary/10 text-primary">{$_('profile.saved')}</Alert.Root>
	{/if}
	{#if form?.error}
		<Alert.Root variant="destructive" class="text-sm">{form.error}</Alert.Root>
	{/if}

	<form method="POST" action="?/save" use:enhance class="flex flex-col gap-5">
		<!-- Avatar -->
		<div class="flex flex-col items-center gap-3">
			<div class="relative">
				<div class="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-muted text-4xl ring-2 ring-border">
					{#if avatarPreview}
						<img src={avatarPreview} alt="avatar" class="h-full w-full object-cover" />
					{:else}
						🐛
					{/if}
				</div>
				{#if uploading}
					<div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
						<Spinner size="sm" class="text-white" />
					</div>
				{/if}
			</div>

			{#if uploadError}
				<p class="text-xs text-destructive">{uploadError}</p>
			{/if}

			<!-- Hidden inputs carry values into the form action -->
			<input type="hidden" name="avatar_url" value={avatarUrl} />

			<Button
				type="button"
				variant="ghost"
				size="sm"
				class="text-primary"
				onclick={() => fileInput.click()}
				disabled={uploading}
			>
				{$_('profile.avatar.change')}
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="sr-only"
				onchange={handleAvatarChange}
			/>
		</div>

		<!-- Display name -->
		<div class="flex flex-col gap-1.5">
			<Label>{$_('profile.name.label')}</Label>
			<Input
				type="text"
				name="display_name"
				bind:value={displayName}
				maxlength={50}
				placeholder="Bugmeister"
			/>
		</div>

		<!-- Bio -->
		<div class="flex flex-col gap-1.5">
			<Label>{$_('profile.bio.label')}</Label>
			<Textarea
				name="bio"
				rows={4}
				bind:value={bio}
				maxlength={300}
				placeholder={$_('profile.bio.placeholder')}
			/>
			<p class="text-muted-foreground text-xs">{bio.length}/300</p>
		</div>

		<Button type="submit" variant="default" class="w-full" disabled={uploading}>
			{$_('profile.save')}
		</Button>
	</form>
</div>
