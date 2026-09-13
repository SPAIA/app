<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
</script>

<svelte:head>
	<title>Impressum</title>
</svelte:head>

<div class="flex flex-col gap-6 px-5 py-6">
	<div class="flex items-center gap-3">
		<Button
			onclick={() => goto('/')}
			variant="ghost"
			size="icon-sm"
			aria-label="Back"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</Button>
		<h1 class="text-xl font-semibold">Impressum</h1>
	</div>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Company Information</h2>
		<p class="text-foreground">
			Playstate UG (haftungsbeschränkt)<br />
			Thomas Cox<br />
			Email: <a href="mailto:hello@playstateprojects.com" class="text-primary hover:underline cursor-pointer">hello@playstateprojects.com</a><br />
			Phone: <a href="tel:+4917680690803" class="text-primary hover:underline cursor-pointer">+49 176 80690803</a>
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Legal Information</h2>
		<p class="text-foreground">
			Registration Number: HRB 249133 B<br />
			VAT Number: DE359100327<br />
			Tax Number: 37/473/51397
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Responsible for Content</h2>
		<p class="text-foreground">
			Thomas Cox<br />
			Email: <a href="mailto:hello@playstateprojects.com" class="text-primary hover:underline cursor-pointer">hello@playstateprojects.com</a>
		</p>
	</section>
</div>
