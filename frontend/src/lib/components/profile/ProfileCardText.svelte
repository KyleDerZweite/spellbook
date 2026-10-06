<script lang="ts">
	import ManaCost from '#lib/components/cards/ManaCost.svelte';
	import { profileTextSegments } from '#lib/profile/card.ts';
	import type { ProfileTotals } from '#lib/profile/types.ts';
	let { text, totals }: { text: string; totals: ProfileTotals | null } = $props();
	let segments = $derived(profileTextSegments(text, totals));
</script>

<div class="profile-card-text">
	{#each segments as segment, i (i)}{#if segment.type === 'mana'}<ManaCost
				cost={segment.value}
				class="!inline-flex align-middle"
			/>{:else}{segment.value}{/if}{/each}
</div>

<style>
	.profile-card-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
