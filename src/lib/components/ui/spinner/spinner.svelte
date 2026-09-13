<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const spinnerVariants = tv({
		base: "animate-spin",
		variants: {
			size: {
				xs: "size-3",
				sm: "size-4",
				default: "size-5",
				lg: "size-6",
			},
		},
		defaultVariants: {
			size: "default",
		},
	});

	export type SpinnerSize = VariantProps<typeof spinnerVariants>["size"];
</script>

<script lang="ts">
	import { cn } from "$lib/utils.js";
	import CircleNotchIcon from "phosphor-svelte/lib/CircleNotchIcon";
	import type { ComponentProps } from "svelte";

	let {
		class: className,
		size,
		...restProps
	}: Omit<ComponentProps<typeof CircleNotchIcon>, "size"> & {
		size?: SpinnerSize;
	} = $props();
</script>

<CircleNotchIcon data-slot="spinner" class={cn(spinnerVariants({ size }), className)} {...restProps} />
