import { expect, it, vi } from 'vitest';
import {
	selectProfileSeed,
	reconcileProfileCardDraft,
	selectAuthSeed
} from '#lib/profile/saved.ts';
import { defaultProfileCard } from '@spellbook/contracts/profile-card.ts';

it('keeps the synchronized Profile snapshot when delayed same-account SSR arrives', () => {
	const initial = {
		user: { accountId: 'account' },
		card: { ...defaultProfileCard('Collector'), name: 'Initial' }
	};
	const current = { ...initial, card: { ...initial.card, name: 'Committed' } };
	expect(selectProfileSeed(null, initial)).toBe(initial);
	expect(selectProfileSeed(current, initial)).toBe(current);
	expect(
		selectProfileSeed(current, { ...initial, user: { accountId: 'other' } }).user.accountId
	).toBe('other');
});
it('preserves newer and unrelated local fields while adopting only clean saved Profile fields', () => {
	const baseline = {
		...defaultProfileCard('Collector'),
		name: 'Saved name',
		rulesText: 'Saved text'
	};
	const draft = { ...baseline, name: 'Newer local name' };
	const remote = { ...baseline, name: 'Earlier submitted name', rulesText: 'Remote text' };
	const result = reconcileProfileCardDraft(draft, baseline, remote);
	expect(result.card.name).toBe('Newer local name');
	expect(result.baseline.name).toBe('Saved name');
	expect(result.card.rulesText).toBe('Remote text');
	expect(result.baseline.rulesText).toBe('Remote text');
});

it('retains current Profile data and a newer draft while a real delayed HTTP seed is decoding', async () => {
	const { createServer } = await import('node:http');
	let release!: () => void, started!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const requested = new Promise<void>((resolve) => {
		started = resolve;
	});
	const stale = { user: { accountId: 'account' }, card: defaultProfileCard('Initial') };
	const server = createServer(async (_request, response) => {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.write('{"user":');
		started();
		await held;
		response.end(JSON.stringify(stale.user) + ',"card":' + JSON.stringify(stale.card) + '}');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw Error('Missing test listener');
	try {
		const delayed = fetch(`http://127.0.0.1:${address.port}/profile`).then((response) =>
			response.json()
		);
		await requested;
		const current = {
			...stale,
			card: { ...stale.card, name: 'Confirmed save', rulesText: 'Remote saved text' }
		};
		const newerDraft = { ...current.card, name: 'Newer draft' };
		release();
		const incoming = await delayed;
		const selected = selectProfileSeed(current, incoming);
		expect(selected).toBe(current);
		expect(reconcileProfileCardDraft(newerDraft, current.card, selected.card).card.name).toBe(
			'Newer draft'
		);
	} finally {
		release();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

it('keeps the synchronized header avatar when a delayed same-account root body finishes decoding', async () => {
	const { createServer } = await import('node:http');
	let release!: () => void, decoding!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		decoding = resolve;
	});
	const initial = {
		accountId: 'account',
		username: 'collector',
		email: 'collector@example.test',
		avatarId: 'old'
	};
	const server = createServer(async (_request, response) => {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.write('{"user":');
		await held;
		response.end(JSON.stringify(initial) + '}');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw Error('Missing test listener');
	const original = Response.prototype.json;
	const instrument = vi.spyOn(Response.prototype, 'json').mockImplementation(function (
		this: Response
	) {
		decoding();
		return original.call(this);
	});
	try {
		const reading = fetch(`http://127.0.0.1:${address.port}/root`).then((response) =>
			response.json()
		);
		await started;
		const synchronized = { ...initial, avatarId: 'new' };
		release();
		const incoming = (await reading).user;
		expect(selectAuthSeed(synchronized, incoming)).toBe(synchronized);
		expect(selectAuthSeed(null, incoming)).toEqual(initial);
		expect(selectAuthSeed(synchronized, { ...incoming, accountId: 'other' })?.accountId).toBe(
			'other'
		);
		expect(selectAuthSeed(synchronized, null)).toBeNull();
	} finally {
		release();
		instrument.mockRestore();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
