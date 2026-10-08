<script lang="ts">
	import type {
		CategoryScope,
		EntryRule,
		DeckRule,
		CategoryRuleChoices
	} from '@spellbook/contracts/category-library.ts';
	import Select from '#lib/components/ui/select/Select.svelte';
	import Button from '#lib/components/ui/button/Button.svelte';
	import RuleEditor from './RuleEditor.svelte';
	let {
		rule,
		scope,
		path = 'root',
		choices
	}: {
		rule: EntryRule | DeckRule;
		scope: CategoryScope;
		path?: string;
		choices: CategoryRuleChoices;
	} = $props();
	const entryOps = [
		{ value: 'type', label: 'Card type' },
		{ value: 'keyword', label: 'Printed keyword' },
		{ value: 'mappedTrait', label: 'Starter trait' },
		{ value: 'oracleTag', label: 'Oracle Tag' },
		{ value: 'canonicalCards', label: 'Selected cards' }
	];
	const deckOps = [
		{ value: 'minimumCopies', label: 'At least this many copies' },
		{ value: 'minimumDistinct', label: 'At least this many distinct cards' },
		{ value: 'percentage', label: 'At least this percentage' }
	];
	const logic = [
		{ value: 'all', label: 'All criteria' },
		{ value: 'any', label: 'Any criterion' },
		{ value: 'not', label: 'Does not match' }
	];
	const traits = [
		'lands',
		'board-wipes',
		'counterspells',
		'removal',
		'ramp',
		'draw',
		'protection',
		'recursion'
	].map((value) => ({ value, label: value.replaceAll('-', ' ') }));
	const types = [
		'Creature',
		'Instant',
		'Sorcery',
		'Enchantment',
		'Artifact',
		'Planeswalker',
		'Land',
		'Battle',
		'Kindred'
	].map((value) => ({ value, label: value }));
	const name = (field: string) => `rule.${path}.${field}`;
</script>

<fieldset class="min-w-0 space-y-3 rounded border border-[var(--border)] p-3">
	<legend>Criterion</legend>
	<Select
		native
		name={name('op')}
		label="Criterion"
		value={rule.op}
		options={[
			...(scope === 'entry' ? entryOps : deckOps),
			...logic,
			...(rule.op === 'comboParticipant' || rule.op === 'comboOutcome'
				? [{ value: rule.op, label: 'Documented combo (source unavailable)' }]
				: [])
		]}
	/>
	{#if rule.op === 'all' || rule.op === 'any'}
		{#each rule.children as child, index}<RuleEditor
				rule={child}
				{scope}
				path={`${path}.${index}`}
				{choices}
			/><Button type="submit" name="ruleAction" value={`remove:${path}.${index}`} variant="ghost"
				>Remove criterion</Button
			>{/each}
		<Button type="submit" name="ruleAction" value={`add:${path}`} variant="secondary"
			>Add criterion</Button
		>
	{:else if rule.op === 'not'}<RuleEditor
			rule={rule.child}
			{scope}
			path={`${path}.child`}
			{choices}
		/>
	{:else if rule.op === 'type'}<Select
			native
			name={name('value')}
			label="Card type"
			value={rule.value}
			options={types}
		/>
	{:else if rule.op === 'keyword'}<label
			>Keyword<input
				class="input"
				name={name('value')}
				value={rule.value}
				maxlength="128"
				placeholder="Flying"
			/></label
		>
	{:else if rule.op === 'mappedTrait'}<Select
			native
			name={name('traitId')}
			label="Starter trait"
			value={rule.traitId}
			options={traits}
		/>
		<p class="text-sm">Uses the immutable starter trait mapping. Ramp excludes Lands.</p>
	{:else if rule.op === 'oracleTag'}<Select
			native
			name={name('tagId')}
			label="Oracle Tag"
			value={rule.tagId}
			options={[
				{ value: '', label: 'Search and select a Tag' },
				...choices.tags.map((t) => ({ value: t.id, label: t.name })),
				...(!choices.tags.some((t) => t.id === rule.tagId) && rule.tagId
					? [{ value: rule.tagId, label: 'Previously selected Tag (currently unavailable)' }]
					: [])
			]}
		/><label
			><input type="checkbox" name={name('includeDescendants')} checked={rule.includeDescendants} /> Include
			descendant Tags</label
		>
	{:else if rule.op === 'canonicalCards'}
		<p>Select canonical cards from the search below.</p>
		{#each choices.cards as card}<label class="block"
				><input
					type="checkbox"
					name={name('oracleIds')}
					value={card.oracleId}
					checked={rule.oracleIds.includes(card.oracleId)}
				/>{card.name}</label
			>{/each}
		{#each rule.oracleIds.filter((id) => !choices.cards.some((c) => c.oracleId === id)) as id}<label
				class="block"
				><input type="checkbox" name={name('oracleIds')} value={id} checked />Previously selected
				card (currently unavailable)</label
			>{/each}
	{:else if rule.op === 'minimumCopies' || rule.op === 'minimumDistinct'}<label
			>Minimum<input
				class="input"
				name={name('minimum')}
				type="number"
				min="1"
				max="2147483647"
				value={rule.minimum}
			/></label
		><RuleEditor rule={rule.predicate} scope="entry" path={`${path}.predicate`} {choices} />
	{:else if rule.op === 'percentage'}<label
			>Percentage<input
				class="input"
				name={name('percentage')}
				type="number"
				min="0"
				max="100"
				step="0.01"
				value={rule.basisPoints / 100}
			/></label
		><Select
			native
			name={name('denominator')}
			label="Count against"
			value={rule.denominator}
			options={[
				{ value: 'all-cards', label: 'All participating cards' },
				{ value: 'nonland', label: 'Participating nonland cards' }
			]}
		/><RuleEditor rule={rule.predicate} scope="entry" path={`${path}.predicate`} {choices} />
	{:else}<p>
			Documented combo evidence is unavailable. This criterion evaluates Unknown, including under
			negation.
		</p>{/if}
</fieldset>
