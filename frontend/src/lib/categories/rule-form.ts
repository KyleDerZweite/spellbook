import type { CategoryScope, EntryRule, DeckRule } from '@spellbook/contracts/category-library.ts';
type Rule = EntryRule | DeckRule;
export function defaultRule(scope: CategoryScope): Rule {
	return scope === 'entry'
		? { op: 'type', value: 'Creature' }
		: { op: 'minimumCopies', minimum: 1, predicate: { op: 'type', value: 'Creature' } };
}
export function readRuleForm(form: FormData, scope: CategoryScope): Rule {
	let original: unknown;
	try {
		original = JSON.parse(String(form.get('rule') ?? ''));
	} catch {
		throw new Error('Invalid rule draft');
	}
	const stack = [{ node: original, depth: 1 }];
	let nodes = 0;
	while (stack.length) {
		const { node, depth } = stack.pop()!;
		if (depth > 8 || ++nodes > 128 || !node || typeof node !== 'object' || Array.isArray(node))
			throw new Error('Rule draft exceeds its structural limits');
		const record = node as Record<string, unknown>;
		if (Array.isArray(record.children)) {
			if (nodes + stack.length + record.children.length > 128)
				throw new Error('Rule draft exceeds its structural limits');
			stack.push(...record.children.map((node) => ({ node, depth: depth + 1 })));
		}
		if (record.child) stack.push({ node: record.child, depth: depth + 1 });
		if (record.predicate) stack.push({ node: record.predicate, depth: depth + 1 });
	}
	const action = String(form.get('ruleAction') ?? '');
	function read(node: Rule, path: string, currentScope: CategoryScope): Rule {
		const field = (name: string) => String(form.get(`rule.${path}.${name}`) ?? '');
		const op = field('op') || node.op;
		if (op !== node.op) {
			if (!action) throw new Error('Update criteria before saving a changed criterion');
			if (op === 'all' || op === 'any') return { op, children: [node] } as Rule;
			if (op === 'not') return { op, child: node } as Rule;
			if (op === 'type') return { op, value: 'Creature' };
			if (op === 'keyword') return { op, value: '' };
			if (op === 'oracleTag') return { op, tagId: '', includeDescendants: true };
			if (op === 'mappedTrait') return { op, traitId: 'lands', mappingVersion: 1 };
			if (op === 'canonicalCards') return { op, oracleIds: [] };
			if (op === 'minimumCopies' || op === 'minimumDistinct')
				return { op, minimum: 1, predicate: { op: 'type', value: 'Creature' } };
			if (op === 'percentage')
				return {
					op,
					basisPoints: 0,
					denominator: 'all-cards',
					predicate: { op: 'type', value: 'Creature' }
				};
			throw new Error('Choose a supported criterion');
		}
		if (op === 'all' || op === 'any') {
			const prior =
				node.op === 'all' || node.op === 'any' ? node.children : [defaultRule(currentScope)];
			const children = prior
				.map((child, index) => read(child, `${path}.${index}`, currentScope))
				.filter((_, index) => action !== `remove:${path}.${index}`);
			if (action === `add:${path}`) children.push(defaultRule(currentScope));
			return { op, children } as Rule;
		}
		if (op === 'not')
			return {
				op,
				child: read(
					node.op === 'not' ? node.child : defaultRule(currentScope),
					`${path}.child`,
					currentScope
				)
			} as Rule;
		if (op === 'type' || op === 'keyword')
			return {
				op,
				value: form.has(`rule.${path}.value`) ? field('value') : node.op === op ? node.value : ''
			};
		if (op === 'oracleTag')
			return {
				op,
				tagId: field('tagId'),
				includeDescendants: form.get(`rule.${path}.includeDescendants`) === 'on'
			};
		if (op === 'mappedTrait')
			return {
				op,
				traitId: field('traitId') as Extract<EntryRule, { op: 'mappedTrait' }>['traitId'],
				mappingVersion: node.op === 'mappedTrait' ? node.mappingVersion : 1
			};
		if (op === 'canonicalCards')
			return { op, oracleIds: form.getAll(`rule.${path}.oracleIds`).map(String) };
		if (op === 'minimumCopies' || op === 'minimumDistinct')
			return {
				op,
				minimum: Number(field('minimum') || (node.op === op ? node.minimum : 1)),
				predicate: read(
					'predicate' in node ? node.predicate : defaultRule('entry'),
					`${path}.predicate`,
					'entry'
				) as EntryRule
			};
		if (op === 'percentage') {
			const text = field('percentage');
			if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text))
				throw new Error('Enter a percentage with at most two decimal places');
			const [whole, fraction = ''] = text.split('.'),
				basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
			return {
				op,
				basisPoints,
				denominator: field('denominator') as 'all-cards' | 'nonland',
				predicate: read(
					'predicate' in node ? node.predicate : defaultRule('entry'),
					`${path}.predicate`,
					'entry'
				) as EntryRule
			};
		}
		if (node.op === 'comboParticipant' || node.op === 'comboOutcome') return node;
		throw new Error('Choose a supported criterion');
	}
	return read(original as Rule, 'root', scope);
}
export function ruleSelections(rule: Rule): { tagIds: string[]; oracleIds: string[] } {
	const tagIds: string[] = [],
		oracleIds: string[] = [];
	function visit(node: Rule) {
		if (node.op === 'oracleTag' && node.tagId) tagIds.push(node.tagId);
		if (node.op === 'canonicalCards') oracleIds.push(...node.oracleIds);
		if (node.op === 'all' || node.op === 'any') node.children.forEach(visit);
		if (node.op === 'not') visit(node.child);
		if ('predicate' in node) visit(node.predicate);
	}
	visit(rule);
	return { tagIds: [...new Set(tagIds)], oracleIds: [...new Set(oracleIds)] };
}
