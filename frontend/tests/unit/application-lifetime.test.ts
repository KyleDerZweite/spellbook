import { beforeEach, describe, expect, it, vi } from 'vitest';

const owners = vi.hoisted(() => ({
	pool: { end: vi.fn() },
	database: vi.fn(),
	value: { start: vi.fn(), close: vi.fn() },
	whole: { start: vi.fn(), close: vi.fn() },
	saved: { close: vi.fn() },
	scan: vi.fn(),
	scanOwner: { close: vi.fn() },
	savedFactory: vi.fn()
}));
vi.mock('@spellbook/backend/db/client.ts', () => ({ createDatabase: owners.database }));
vi.mock('@spellbook/backend', () => ({
	createCatalog: () => ({}),
	createLocalAuth: () => ({}),
	createProfile: () => ({}),
	createDashboard: () => ({}),
	createInventory: () => ({}),
	createInventoryMutations: () => ({}),
	createDecks: () => ({}),
	createValuation: () => ({}),
	createCategories: () => ({}),
	createInventoryValues: () => ({}),
	createScan: owners.scan,
	createSavedState: owners.savedFactory,
	createValueHistoryRunner: () => owners.value,
	createWholeDeckCategoryRunner: () => owners.whole,
	evaluateWholeDeck: vi.fn()
}));
import { createApplication } from '@spellbook/backend/application.ts';
const configuration = { databaseUrl: 'postgres://private:secret@localhost/database' };

beforeEach(() => {
	vi.resetAllMocks();
	owners.database.mockReturnValue({ db: {}, pool: owners.pool });
	owners.pool.end.mockResolvedValue(undefined);
	owners.value.close.mockResolvedValue(undefined);
	owners.whole.close.mockResolvedValue(undefined);
	owners.saved.close.mockResolvedValue(undefined);
	owners.savedFactory.mockReturnValue(owners.saved);
	owners.scan.mockReturnValue(owners.scanOwner);
});

describe('application resource lifetime', () => {
	it.each([
		[{}, 'DATABASE_URL'],
		[{ ...configuration, valueHistoryTimezone: 'invalid/timezone' }, 'time zone'],
		[{ ...configuration, valueHistoryEnabled: 'yes' }, 'VALUE_HISTORY_ENABLED'],
		[{ ...configuration, commanderSpellbookEnabled: 'True' }, 'COMMANDER_SPELLBOOK_ENABLED']
	])('validates before creating resources', async (config, message) => {
		await expect(createApplication(config)).rejects.toThrow(new RegExp(message, 'i'));
		expect(owners.database).not.toHaveBeenCalled();
	});

	it('constructs without starting background work and exposes only feature methods', async () => {
		const lifetime = await createApplication(configuration);
		expect(owners.value.start).not.toHaveBeenCalled();
		expect(owners.whole.start).not.toHaveBeenCalled();
		expect(lifetime.application).not.toHaveProperty('db');
		expect(lifetime.application).not.toHaveProperty('pool');
		expect(owners.savedFactory).toHaveBeenCalledWith(configuration.databaseUrl, expect.anything());
		await lifetime.close();
	});

	it.each(['true', 'false'])('preserves the explicit Combo owner option %s', async (flag) => {
		const lifetime = await createApplication({ ...configuration, commanderSpellbookEnabled: flag });
		expect(owners.database).toHaveBeenCalledWith(configuration.databaseUrl, {
			commanderSpellbookEnabled: flag === 'true'
		});
		await lifetime.close();
	});

	it('uses one build fallback and never starts runners during analysis', async () => {
		const lifetime = await createApplication({ buildAnalysis: true });
		lifetime.start();
		lifetime.start();
		expect(owners.whole.start).not.toHaveBeenCalled();
		expect(owners.value.start).not.toHaveBeenCalled();
		expect(owners.savedFactory.mock.calls[0][0]).toBe(owners.database.mock.calls[0][0]);
		await lifetime.close();
	});

	it.each(['true', 'false'])('starts once with history enabled %s', async (enabled) => {
		const lifetime = await createApplication({ ...configuration, valueHistoryEnabled: enabled });
		lifetime.start();
		lifetime.start();
		expect(owners.whole.start).toHaveBeenCalledTimes(1);
		expect(owners.value.start).toHaveBeenCalledTimes(enabled === 'true' ? 1 : 0);
		await lifetime.close();
		expect(() => lifetime.start()).toThrow('Application is closed');
	});

	it('close before start prevents starting and concurrent close joins resource settlement', async () => {
		let settle!: () => void;
		owners.whole.close.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					settle = resolve;
				})
		);
		const lifetime = await createApplication(configuration);
		const first = lifetime.close();
		expect(lifetime.close()).toBe(first);
		expect(() => lifetime.start()).toThrow('Application is closed');
		await vi.waitFor(() => expect(owners.whole.close).toHaveBeenCalledTimes(1));
		expect(owners.pool.end).not.toHaveBeenCalled();
		settle();
		await first;
		expect(lifetime.close()).toBe(first);
		expect(owners.pool.end).toHaveBeenCalledTimes(1);
	});

	it('waits for every owner and closes the pool after a runner fails with a safe error', async () => {
		let settle!: () => void;
		owners.value.close.mockImplementation(() => {
			throw Error(configuration.databaseUrl);
		});
		owners.saved.close.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					settle = resolve;
				})
		);
		const lifetime = await createApplication(configuration);
		const closing = lifetime.close();
		const rejected = expect(closing).rejects.toThrow(/^Application shutdown failed$/);
		await vi.waitFor(() => expect(owners.saved.close).toHaveBeenCalled());
		expect(owners.pool.end).not.toHaveBeenCalled();
		settle();
		await rejected;
		expect(owners.pool.end).toHaveBeenCalledTimes(1);
		expect(owners.scanOwner.close).toHaveBeenCalledTimes(1);
	});

	it('redacts pool shutdown failure and retains the memoized rejection', async () => {
		owners.pool.end.mockRejectedValue(Error(configuration.databaseUrl));
		const lifetime = await createApplication(configuration);
		const closing = lifetime.close();
		await expect(closing).rejects.toThrow(/^Application shutdown failed$/);
		expect(lifetime.close()).toBe(closing);
	});

	it('awaits partial construction cleanup and preserves its original error', async () => {
		const failure = new Error('Unexpected feature construction failure');
		let settle!: () => void;
		owners.scan.mockImplementation(() => {
			throw failure;
		});
		owners.whole.close.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					settle = resolve;
				})
		);
		const constructing = createApplication(configuration);
		const rejected = expect(constructing).rejects.toBe(failure);
		await vi.waitFor(() => expect(owners.whole.close).toHaveBeenCalled());
		expect(owners.pool.end).not.toHaveBeenCalled();
		settle();
		await rejected;
		expect(owners.saved.close).toHaveBeenCalledTimes(1);
		expect(owners.pool.end).toHaveBeenCalledTimes(1);
	});
});
