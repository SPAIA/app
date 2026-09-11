<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

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
	<h1 class="text-lg font-medium text-base-content">{$_('profile.title')}</h1>

	{#if form?.success}
		<div class="alert alert-success text-sm">{$_('profile.saved')}</div>
	{/if}
	{#if form?.error}
		<div class="alert alert-error text-sm">{form.error}</div>
	{/if}

	<form method="POST" action="?/save" use:enhance class="flex flex-col gap-5">
		<!-- Avatar -->
		<div class="flex flex-col items-center gap-3">
			<div class="relative">
				<div class="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-base-200 text-4xl ring-2 ring-base-300">
					{#if avatarPreview}
						<img src={avatarPreview} alt="avatar" class="h-full w-full object-cover" />
					{:else}
						🐛
					{/if}
				</div>
				{#if uploading}
					<div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
						<span class="loading loading-spinner loading-sm text-white"></span>
					</div>
				{/if}
			</div>

			{#if uploadError}
				<p class="text-xs text-error">{uploadError}</p>
			{/if}

			<!-- Hidden inputs carry values into the form action -->
			<input type="hidden" name="avatar_url" value={avatarUrl} />

			<button
				type="button"
				class="btn btn-ghost btn-sm text-primary"
				onclick={() => fileInput.click()}
				disabled={uploading}
			>
				{$_('profile.avatar.change')}
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="sr-only"
				onchange={handleAvatarChange}
			/>
		</div>

		<!-- Display name -->
		<label class="form-control">
			<div class="label"><span class="label-text">{$_('profile.name.label')}</span></div>
			<input
				type="text"
				name="display_name"
				class="input input-bordered w-full"
				bind:value={displayName}
				maxlength="50"
				placeholder="Bugmeister"
			/>
		</label>

		<!-- Bio -->
		<label class="form-control">
			<div class="label"><span class="label-text">{$_('profile.bio.label')}</span></div>
			<textarea
				name="bio"
				class="textarea textarea-bordered w-full"
				rows="4"
				bind:value={bio}
				maxlength="300"
				placeholder={$_('profile.bio.placeholder')}
			></textarea>
			<div class="label">
				<span class="label-text-alt text-base-content/40">{bio.length}/300</span>
			</div>
		</label>

		<button type="submit" class="btn btn-primary w-full" disabled={uploading}>
			{$_('profile.save')}
		</button>
	</form>
</div>
