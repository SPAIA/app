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
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Provider</h2>
		<p class="text-foreground">
			Playstate UG (haftungsbeschränkt)<br />
			Schönholzer Straße 8A<br />
			13187 Berlin<br />
			Germany
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Represented by</h2>
		<p class="text-foreground">Thomas Cox, Managing Director (Geschäftsführer)</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact</h2>
		<p class="text-foreground">
			Email: <a href="mailto:hello@playstateprojects.com" class="text-primary hover:underline cursor-pointer">hello@playstateprojects.com</a><br />
			Phone: <a href="tel:+4917680690803" class="text-primary hover:underline cursor-pointer">+49 176 80690803</a>
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Register entry</h2>
		<p class="text-foreground">
			Registered in the commercial register (Handelsregister)<br />
			Register court: Amtsgericht Charlottenburg (Berlin)<br />
			Registration number: HRB 249133 B
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">VAT ID</h2>
		<p class="text-foreground">
			VAT identification number under § 27a UStG: DE359100327
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Responsible for content</h2>
		<p class="text-foreground">
			Responsible under § 18 (2) MStV:<br />
			Thomas Cox, Schönholzer Straße 8A, 13187 Berlin, Germany
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Consumer dispute resolution</h2>
		<p class="text-foreground">
			We are not willing or obliged to take part in dispute resolution proceedings before a
			consumer arbitration board.
		</p>
	</section>

	<p class="text-sm text-muted-foreground">
		See also our <a href="/privacy" class="text-primary hover:underline cursor-pointer">Privacy Policy</a>.
	</p>
</div>
