<script lang="ts">
	import { page } from '$app/state';
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import MetricCards from '../MetricCards.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<MetricCards {dashboard} demo={page.data.demoMode} />
