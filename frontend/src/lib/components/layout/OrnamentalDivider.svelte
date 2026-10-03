<script lang="ts">
	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<div class="h-px shrink-0 bg-border {className}" role="separator"></div>
