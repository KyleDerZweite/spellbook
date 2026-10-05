<script lang="ts">
	import { getAvatar } from '#lib/profile/avatars.ts';

	let {
		id,
		size = 32,
		class: className = ''
	}: { id?: string | null; size?: number; class?: string } = $props();
	const avatar = $derived(getAvatar(id));
</script>

<svg
	class={className}
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	shape-rendering="crispEdges"
	aria-hidden="true"
	focusable="false"
>
	{#each avatar.paths as { fill, d }}
		<path {fill} {d} />
	{/each}
</svg>
