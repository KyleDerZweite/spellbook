<script lang="ts">
	import type { CategoryDifference } from '@spellbook/contracts/category-library.ts';
	import ComboEvidence from './ComboEvidence.svelte';
	let { value, label }: { value: CategoryDifference['before']; label: string } = $props();
	const whole = $derived(!!value && 'decision' in value);
	const decision = $derived(
		value && 'decision' in value ? value.decision : value && 'evidence' in value ? value : null
	);
</script>

<ComboEvidence
	evidence={decision?.evidence?.combo}
	label={`${label} ${decision?.state === 'Pending' ? (whole ? 'retained valid evidence, stale' : 'latest Unknown entry evaluation') : 'saved evidence'}`}
/>
<ComboEvidence
	evidence={decision?.previousEvaluation?.combo}
	label={`${label} ${whole && decision?.state === 'Pending' ? 'latest Unknown attempt' : 'previous automatic evidence'}`}
/>
