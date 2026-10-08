import type {
	EntryRule,
	DeckRule,
	CategoryRuleChoices
} from '@spellbook/contracts/category-library.ts';
export function describeCategoryRule(
	rule: EntryRule | DeckRule,
	choices?: CategoryRuleChoices
): string {
	switch (rule.op) {
		case 'all':
			return `All: ${rule.children.map((r) => describeCategoryRule(r, choices)).join('; ')}`;
		case 'any':
			return `Any: ${rule.children.map((r) => describeCategoryRule(r, choices)).join('; ')}`;
		case 'not':
			return `Does not match: ${describeCategoryRule(rule.child, choices)}`;
		case 'type':
			return `Card type ${rule.value}`;
		case 'keyword':
			return `Printed keyword ${rule.value}`;
		case 'oracleTag':
			return `Oracle Tag ${choices?.tags.find((t) => t.id === rule.tagId)?.name ?? 'previously selected Tag'}${rule.includeDescendants ? ' including descendants' : ''}`;
		case 'mappedTrait':
			return `Starter trait ${rule.traitId.replaceAll('-', ' ')}`;
		case 'canonicalCards':
			return `Selected cards: ${rule.oracleIds.map((id) => choices?.cards.find((c) => c.oracleId === id)?.name ?? 'previously selected card').join(', ')}`;
		case 'minimumCopies':
			return `At least ${rule.minimum} copies matching ${describeCategoryRule(rule.predicate, choices)}`;
		case 'minimumDistinct':
			return `At least ${rule.minimum} distinct canonical cards matching ${describeCategoryRule(rule.predicate, choices)}`;
		case 'percentage':
			return `At least ${rule.basisPoints / 100}% of ${rule.denominator === 'nonland' ? 'nonland cards' : 'all cards'} matching ${describeCategoryRule(rule.predicate, choices)}`;
		case 'comboParticipant':
		case 'comboOutcome':
			return 'Documented combo criterion. Required source is unavailable.';
	}
}
