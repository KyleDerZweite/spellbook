<script lang="ts">
	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<div class="flex items-center gap-3 {className}" role="separator">
	<div
		class="h-px flex-1"
		style="background: linear-gradient(to right, transparent, var(--color-gold-dim), transparent);"
	></div>
	<span class="font-display text-xs text-gold-dim select-none">&#9670;</span>
	<div
		class="h-px flex-1"
		style="background: linear-gradient(to right, transparent, var(--color-gold-dim), transparent);"
	></div>
</div>
