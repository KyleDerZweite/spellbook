<script lang="ts">
	interface Props {
		total: number;
		unique: number;
		foils: number;
		class?: string;
	}

	let { total, unique, foils, class: className = '' }: Props = $props();
</script>

<div class="flex items-center gap-6 {className}">
	<div class="text-center">
		<p class="font-mono text-lg font-medium text-text-primary">{total}</p>
		<p class="font-body text-xs text-text-secondary">Total Cards</p>
	</div>
	<div class="text-center">
		<p class="font-mono text-lg font-medium text-text-primary">{unique}</p>
		<p class="font-body text-xs text-text-secondary">Unique</p>
	</div>
	<div class="text-center">
		<p class="font-mono text-lg font-medium text-text-primary">{foils}</p>
		<p class="font-body text-xs text-text-secondary">Foils</p>
	</div>
</div>
