<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<svelte:head>
	<title>Impressum</title>
</svelte:head>

<div class="flex flex-col gap-6 px-5 py-6">
	<div class="flex items-center gap-3">
		<button
			onclick={() => goto('/')}
			class="btn btn-ghost btn-sm btn-circle"
			aria-label="Back"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<h1 class="text-xl font-semibold">Impressum</h1>
	</div>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/50">Company Information</h2>
		<p class="text-base-content">
			Playstate UG (haftungsbeschränkt)<br />
			Thomas Cox<br />
			Email: <a href="mailto:hello@playstateprojects.com" class="link link-primary">hello@playstateprojects.com</a><br />
			Phone: <a href="tel:+4917680690803" class="link link-primary">+49 176 80690803</a>
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/50">Legal Information</h2>
		<p class="text-base-content">
			Registration Number: HRB 249133 B<br />
			VAT Number: DE359100327<br />
			Tax Number: 37/473/51397
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/50">Responsible for Content</h2>
		<p class="text-base-content">
			Thomas Cox<br />
			Email: <a href="mailto:hello@playstateprojects.com" class="link link-primary">hello@playstateprojects.com</a>
		</p>
	</section>
</div>
