<script lang="ts">
	import type { ComboEvidence, ComboProof } from '@spellbook/contracts/combo.ts';
	let {
		evidence,
		label = 'Documented combo evidence'
	}: { evidence?: ComboEvidence | null; label?: string } = $props();
	const zoneNames: Record<string, string> = {
		H: 'Hand',
		B: 'Battlefield',
		C: 'Command zone',
		E: 'Exile',
		G: 'Graveyard',
		L: 'Library'
	};
</script>

{#if evidence}
	<section class="combo-evidence" aria-label={label}>
		<p>
			{label}. Source: {evidence.source.availability}. Publication {evidence.source.publicationId ??
				'unavailable'}. Source date: {evidence.source.sourceTime ?? 'unavailable'}.
		</p>
		{#if evidence.source.refreshStatus.kind === 'Failed'}<p>
				Latest source refresh failed. {evidence.source.availability === 'Available'
					? 'The retained valid publication remains usable.'
					: 'Combo facts are unavailable.'}
			</p>{/if}
		<p>
			Source version: {evidence.source.sourceVersion ?? 'unavailable'}. Parser: {evidence.source
				.parserVersion ?? 'unavailable'}. Policy: {evidence.source.policyVersion}. Payload digest: {evidence
				.source.payloadDigest ?? 'unavailable'}. Decoded digest: {evidence.source.decodedDigest ??
				'unavailable'}.
		</p>
		{#each evidence.evaluations as evaluation}
			<p>
				Outcome {evaluation.proof?.variant.producedOutcomes.find(
					(outcome) => outcome.id === evaluation.outcomeId
				)?.name ?? evaluation.outcomeId} ({evaluation.outcomeId}) outcome truth: {evaluation.truth}.
				Participating roles: {evaluation.roles.join(', ')}.
			</p>
			{#if evaluation.participantTruth !== undefined}<p>
					Entry participation: {evaluation.participantTruth}.
				</p>{/if}
			{#if evaluation.proof}
				{@const proof = evaluation.proof}
				{#if !evaluation.participantWitnesses?.some((witness) => witness.proof.variant.id === proof.variant.id && witness.proof.publicationId === proof.publicationId)}
					{@render documentedProof(proof)}
				{/if}
			{:else if evaluation.truth === 'Unknown'}<p>
					The available facts cannot establish this outcome. Unknown remains Unknown under negation.
				</p>{:else if evaluation.truth === 'False'}<p>
					This publication has no ingredient match for this outcome in the participating
					composition.
				</p>{/if}
			{#each evaluation.participantWitnesses ?? [] as witness}
				<p>Participant witness for related entries: {witness.entryIds.join(', ')}.</p>
				{@render documentedProof(witness.proof)}
			{/each}
		{/each}
	</section>
{/if}

{#snippet documentedProof(proof: ComboProof)}
	<p>Documented ingredients are present. Gameplay prerequisites are unchecked.</p>
	<p>
		<a
			href={`https://commanderspellbook.com/combo/${encodeURIComponent(proof.variant.id)}/`}
			target="_blank"
			rel="noopener noreferrer">Commander Spellbook variant {proof.variant.id}</a
		>. Publication {proof.publicationId}. Parser {proof.parserVersion}. Policy {proof.policyVersion}.
		Participating roles: {proof.roles.join(', ')}.
	</p>
	<ul>
		{#each proof.variant.ingredients as ingredient}<li>
				{ingredient.quantity} × {ingredient.name}{ingredient.mustBeCommander
					? ' (requires Commander role)'
					: ''}. Unchecked starting zones: {ingredient.zones
					.map((zone) => zoneNames[zone] ?? zone)
					.join(', ') || 'unspecified'}. {#if ingredient.usedFace !== null}Required face: {ingredient.usedFace}.
				{/if}{#each Object.entries(ingredient.states).filter(([, value]) => value.trim() !== '') as [state, value]}{state}:
					{value}.
				{/each}
			</li>{/each}
	</ul>
	<p>Unchecked mana requirement: {proof.variant.mana || 'none recorded'}.</p>
	<p class="source-text">
		Unchecked prerequisites: {proof.variant.prerequisites || 'none recorded'}
	</p>
	{#if proof.variant.steps}<details>
			<summary>Documented steps, unchecked</summary>
			<p class="source-text">{proof.variant.steps}</p>
		</details>{/if}
	{#if proof.variant.notes}<p class="source-text">Source notes: {proof.variant.notes}</p>{/if}
{/snippet}

<style>
	.combo-evidence {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.source-text {
		white-space: pre-wrap;
	}
</style>
