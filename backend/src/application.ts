import {
	createCatalog,
	createLocalAuth,
	createProfile,
	createDashboard,
	createInventory,
	createInventoryMutations,
	createScan,
	createDecks,
	createValuation,
	createSavedState,
	createCategories,
	createInventoryValues,
	createValueHistoryRunner,
	createWholeDeckCategoryRunner,
	evaluateWholeDeck
} from './index.ts';
import { createDatabase } from './db/client.ts';
import type { ScanConfiguration } from './scan/application.ts';

export interface ApplicationConfiguration {
	databaseUrl?: string;
	buildAnalysis?: boolean;
	demoMode?: boolean;
	valueHistoryTimezone?: string;
	valueHistoryEnabled?: string;
	commanderSpellbookEnabled?: string;
	scan?: ScanConfiguration;
}

export async function createApplication(configuration: ApplicationConfiguration) {
	const databaseUrl = configuration.databaseUrl?.trim();
	if (!databaseUrl && !configuration.buildAnalysis)
		throw new Error('DATABASE_URL must be configured for Postgres persistence');
	const timezone = configuration.valueHistoryTimezone?.trim() || 'Europe/Berlin';
	new Intl.DateTimeFormat('en', { timeZone: timezone });
	const enabled = configuration.valueHistoryEnabled ?? 'true';
	if (!['true', 'false'].includes(enabled))
		throw new Error('VALUE_HISTORY_ENABLED must be true or false');
	const comboEnabled = configuration.commanderSpellbookEnabled ?? 'false';
	if (!['true', 'false'].includes(comboEnabled))
		throw new Error('COMMANDER_SPELLBOOK_ENABLED must be true or false');
	const resolvedUrl = databaseUrl || 'postgres://spellbook:spellbook@localhost:5432/spellbook';
	const { db, pool } = createDatabase(resolvedUrl, {
		commanderSpellbookEnabled: comboEnabled === 'true'
	});
	let valueRunner: ReturnType<typeof createValueHistoryRunner> | undefined;
	let wholeRunner: ReturnType<typeof createWholeDeckCategoryRunner> | undefined;
	let savedState: ReturnType<typeof createSavedState> | undefined;
	let scan: ReturnType<typeof createScan> | undefined;
	let started = false;
	let closed = false;
	let closing: Promise<void> | undefined;
	function close(): Promise<void> {
		closed = true;
		return (closing ??= Promise.resolve().then(async () => {
			const results = await Promise.allSettled([
				Promise.resolve().then(() => valueRunner?.close()),
				Promise.resolve().then(() => wholeRunner?.close()),
				Promise.resolve().then(() => savedState?.close()),
				Promise.resolve().then(() => scan?.close())
			]);
			const poolResult = await Promise.allSettled([Promise.resolve().then(() => pool.end())]);
			if ([...results, ...poolResult].some((result) => result.status === 'rejected'))
				throw new Error('Application shutdown failed');
		}));
	}
	try {
		const catalog = createCatalog(pool);
		const auth = createLocalAuth(db, {
			demoMode: configuration.demoMode ?? false
		});
		const valuation = createValuation(pool, auth);
		const inventoryValues = createInventoryValues(pool, auth, valuation, {
			timezone
		});
		valueRunner = createValueHistoryRunner(pool, inventoryValues);
		wholeRunner = createWholeDeckCategoryRunner(db, evaluateWholeDeck);
		savedState = createSavedState(resolvedUrl, auth);
		const application = {
			catalog,
			auth,
			valuation,
			inventoryValues,
			savedState,
			categories: createCategories(db, auth),
			dashboard: createDashboard(pool, auth, inventoryValues),
			scan: (scan = createScan(db, pool, catalog, auth, configuration.scan ?? {})),
			inventory: {
				...createInventory(pool, auth),
				...createInventoryMutations(db, catalog, auth)
			},
			profile: createProfile(db, auth, {
				demoMode: configuration.demoMode ?? false
			}),
			decks: createDecks(db, catalog, auth, valuation)
		};
		return {
			application,
			start() {
				if (closed) throw new Error('Application is closed');
				if (started || configuration.buildAnalysis) return;
				started = true;
				wholeRunner!.start();
				if (enabled === 'true') valueRunner!.start();
			},
			close
		};
	} catch (cause) {
		await close().catch(() => {});
		throw cause;
	}
}

export type Application = Awaited<ReturnType<typeof createApplication>>['application'];
