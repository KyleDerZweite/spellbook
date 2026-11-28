import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type {
	InventoryEntry,
	InventoryEntryDetail,
	InventoryPage,
	InventoryQuery,
	RevisionChanged
} from '@spellbook/contracts/inventory.ts';
import { inventoryQueryKey } from '@spellbook/contracts/inventory-query.ts';
import { DemoDraftConflict } from './conflict.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';
import { readDemo, updateDemo } from './storage.ts';

const section = 'inventory';
const api = '/api/v1/mtg/inventory';
const count = (entries: InventoryEntry[]) =>
	entries.reduce((sum, entry) => sum + entry.quantity, 0);
const membership = (state: InventoryPage, id: string) =>
	state.memberships.filter(({ entryId }) => entryId === id).map(({ groupId }) => groupId);

export function demoInventoryEntry(state: InventoryPage, id: string): InventoryEntryDetail | null {
	const entry = state.entries.find((entry) => entry.id === id);
	return entry ? { entry, memberships: membership(state, id), revision: state.revision } : null;
}

export function demoInventoryEntries(
	state: InventoryPage,
	query: InventoryQuery
): InventoryEntry[] {
	const compare = (a: string, b: string) => a.localeCompare(b, 'und');
	const search = query.q.toLowerCase();
	const groupEntries = query.group
		? new Set(
				state.memberships
					.filter(({ groupId }) => groupId === query.group)
					.map(({ entryId }) => entryId)
			)
		: null;
	const direction = query.dir === 'asc' ? 1 : -1;
	const variantDirection = query.variantDir === 'asc' ? 1 : -1;
	const variantValue = (entry: InventoryEntry) => {
		if (query.variant === 'finish') return Number(entry.finish === 'foil');
		if (query.variant === 'condition')
			return ['NM', 'LP', 'MP', 'HP', 'DMG'].indexOf(entry.condition);
		return query.variant === 'quantity' ? entry.quantity : 0;
	};
	return state.entries
		.filter((entry) => {
			return (
				(!search ||
					[entry.name, entry.setCode, entry.notes, entry.condition].some((value) =>
						value.toLowerCase().includes(search)
					)) &&
				(!query.sets.length || query.sets.includes(entry.setCode.toLowerCase())) &&
				(query.finish === 'all' || entry.finish === query.finish) &&
				(query.condition === 'all' || entry.condition === query.condition) &&
				(!groupEntries || groupEntries.has(entry.id))
			);
		})
		.sort((a, b) => {
			const set = compare(a.setCode, b.setCode);
			const name = compare(a.name, b.name);
			const variant = (variantValue(a) - variantValue(b)) * variantDirection;
			const order =
				query.sort === 'newest'
					? compare(b.createdAt, a.createdAt)
					: query.sort === 'set'
						? direction * set || variant || name
						: variant || direction * name || set;
			return order || compare(a.catalogCardId, b.catalogCardId) || compare(a.id, b.id);
		});
}

export function demoInventoryPage(state: InventoryPage, query: InventoryQuery): InventoryPage {
	const matching = demoInventoryEntries(state, query);
	const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
	const groups = state.groups
		.map((group) => ({ ...group, entryCount: 0, quantity: 0 }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const byGroup = new Map(groups.map((group) => [group.id, group]));
	for (const membership of state.memberships) {
		const group = byGroup.get(membership.groupId);
		const entry = byId.get(membership.entryId);
		if (!entry || !group) continue;
		group.entryCount++;
		group.quantity += entry.quantity;
	}
	const directory = groups.filter(({ name }) => name.toLowerCase().includes(query.q.toLowerCase()));
	const isDirectory = query.view === 'groups' && !query.group;
	const entries = isDirectory ? [] : matching.slice(query.offset, query.offset + query.limit);
	return {
		...state,
		query,
		queryKey: inventoryQueryKey(query),
		groups,
		groupPage: directory.slice(query.offset, query.offset + query.limit),
		groupCount: directory.length,
		entries,
		memberships: state.memberships.filter(({ entryId }) =>
			entries.some(({ id }) => id === entryId)
		),
		matching: { entryCount: matching.length, copyCount: count(matching) },
		totals: {
			entryCount: state.entries.length,
			copyCount: count(state.entries),
			canonicalCardCount: new Set(state.entries.map(({ canonicalCardId }) => canonicalCardId)).size,
			foilEntryCount: state.entries.filter(({ finish }) => finish === 'foil').length,
			setCount: new Set(state.entries.map(({ setCode }) => setCode)).size
		},
		setProgress: null
	};
}

export function readDemoInventory(session: string) {
	return readDemo<InventoryPage>(session, section);
}

async function readSeed(): Promise<InventoryPage> {
	const limit = 200;
	let seed: InventoryPage | undefined;
	for (let offset = 0; ; offset += limit) {
		const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
		if (seed) query.set('revision', seed.revision);
		const response = await fetch(`${api}?${query}`, { cache: 'no-store' });
		if (!response.ok) throw new Error('Inventory seed unavailable');
		const page: InventoryPage | RevisionChanged = await response.json();
		if (page.kind !== 'Page') throw new Error('Inventory seed changed');
		if (!seed) seed = page;
		else {
			seed.entries.push(...page.entries);
			seed.memberships.push(...page.memberships);
		}
		if (seed.entries.length >= page.matching.entryCount || page.entries.length < limit) return seed;
	}
}

export async function mutateDemoInventory(
	session: string,
	operation: string,
	form: FormData,
	accountId: string,
	generation: string | undefined,
	card?: CardDocument
): Promise<void> {
	const seed = (await readDemoInventory(session)) ?? (await readSeed());
	await updateDemo(
		session,
		section,
		seed,
		(state) => {
			const field = (key: string) => String(form.get(key) ?? '');
			const id = field('entryId');
			const groupId = field('groupId');
			const entry = state.entries.find((entry) => entry.id === id);
			const timestamp = new Date().toISOString();
			switch (operation) {
				case 'addToInventory': {
					if (!card) throw new ValidationError('Printing not found');
					const finish = field('finish');
					const condition = field('condition');
					const quantity = Number(field('quantity'));
					if (!Number.isSafeInteger(quantity) || quantity < 1)
						throw new ValidationError('Invalid quantity');
					const existing = state.entries.find(
						(entry) =>
							entry.catalogCardId === card.id &&
							entry.finish === finish &&
							entry.condition === condition
					);
					if (existing) {
						existing.quantity += quantity;
						existing.updatedAt = timestamp;
					} else {
						state.entries.push({
							id: crypto.randomUUID(),
							inventoryId: state.entries[0]?.inventoryId ?? accountId,
							accountId,
							game: 'mtg',
							name: card.name,
							catalogCardId: card.id,
							canonicalCardId: card.oracle_id,
							setCode: card.set_code,
							imageUri: card.image_uri || card.image_uri_small,
							quantity,
							finish,
							condition,
							notes: '',
							notesRevision: '0',
							spellbookPosition: 0,
							createdAt: timestamp,
							updatedAt: timestamp
						});
					}
					if (!state.sets.some(({ code }) => code === card.set_code)) {
						state.sets.push({ code: card.set_code, name: card.set_name });
					}
					break;
				}
				case 'createGroup':
				case 'renameGroup': {
					const name = field('name').trim();
					if (
						!name ||
						name.length > 64 ||
						state.groups.some(
							(group) => group.id !== groupId && group.name.toLowerCase() === name.toLowerCase()
						)
					)
						throw new ValidationError('Invalid Box name');
					if (operation === 'createGroup')
						state.groups.push({
							id: crypto.randomUUID(),
							name,
							quantity: 0,
							entryCount: 0
						});
					else
						state.groups = state.groups.map((group) =>
							group.id === groupId ? { ...group, name } : group
						);
					break;
				}
				case 'deleteGroup':
					state.groups = state.groups.filter(({ id }) => id !== groupId);
					state.memberships = state.memberships.filter(
						(membership) => membership.groupId !== groupId
					);
					break;
				case 'assignGroups':
					if (!entry) throw new ValidationError('Inventory entry not found');
					state.memberships = state.memberships.filter(({ entryId }) => entryId !== id);
					for (const group of new Set(form.getAll('groupId').map(String))) {
						if (!state.groups.some(({ id }) => id === group))
							throw new ValidationError('Box not found');
						state.memberships.push({ entryId: id, groupId: group });
					}
					break;
				case 'remove':
					if (!entry || entry.quantity !== Number(field('expectedQuantity'))) {
						throw new ValidationError('Inventory quantity changed');
					}
					state.entries = state.entries.filter(({ id: entryId }) => entryId !== id);
					state.memberships = state.memberships.filter(({ entryId }) => entryId !== id);
					break;
				case 'updateQuantity': {
					if (!entry) throw new ValidationError('Inventory entry not found');
					const quantity = form.has('delta')
						? entry.quantity + Number(field('delta'))
						: form.has('quantity') &&
							  (!form.has('quantityBase') || field('quantityBase') !== field('quantity'))
							? Number(field('quantity'))
							: entry.quantity;
					if (!Number.isSafeInteger(quantity) || quantity < 1)
						throw new ValidationError('Invalid quantity');
					entry.quantity = quantity;
					if (
						form.has('notes') &&
						(field('notes') !== field('notesOriginal') || form.has('rebaseNotesRevision'))
					) {
						if (
							field(form.has('rebaseNotesRevision') ? 'rebaseNotesRevision' : 'notesRevision') !==
							entry.notesRevision
						)
							throw new DemoDraftConflict();
						entry.notes = field('notes');
						entry.notesRevision = String(BigInt(entry.notesRevision) + 1n);
					}
					entry.updatedAt = timestamp;
					break;
				}
				default:
					throw new ValidationError('Unsupported Demo action');
			}
			state.revision = String(BigInt(state.revision) + 1n);
			return state;
		},
		{ generation }
	);
}

export function demoInventoryOperation(url: URL): string {
	return [...url.searchParams.keys()].find((key) => key.startsWith('/'))?.slice(1) ?? '';
}
