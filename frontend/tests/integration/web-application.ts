import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { createApplication } from '@spellbook/backend/application.ts';
import { createHttpApplication } from '@spellbook/backend/http/application.ts';
import { RemoteClient } from '../../src/lib/server/remote/client.ts';

const origin = 'https://spellbook.test';
const lifetime = await createApplication({
	databaseUrl: process.env.TEST_DATABASE_URL,
	buildAnalysis: !process.env.TEST_DATABASE_URL,
	demoMode: process.env.DEMO_MODE === 'true',
	valueHistoryEnabled: 'false',
	commanderSpellbookEnabled: process.env.COMMANDER_SPELLBOOK_ENABLED
});
export const application = lifetime.application;
export const http = createHttpApplication(application, {
	publicOrigin: origin,
	demoMode: process.env.DEMO_MODE === 'true'
});
const credentials = new WeakMap<AuthUser, string>();
const requests = new AsyncLocalStorage<{ locals: App.Locals }>();

export function getWebRequestEvent() {
	const event = requests.getStore();
	if (!event) throw new Error('No integration web request is active');
	return event;
}
export async function authenticate(...args: Parameters<typeof application.auth.authenticate>) {
	const result = await application.auth.authenticate(...args);
	if (result) credentials.set(result.user, result.session.token);
	return result;
}
export async function validateSession(token: string | undefined) {
	const actor = await application.auth.validateSession(token);
	if (actor && token) credentials.set(actor, token);
	return actor;
}
export const { createSession, revokeSession, withPasswordDerivation } = application.auth;

/** Run the real web adapter against the real API without claiming network-host evidence. */
export function webHandler<
	E extends { locals: App.Locals; getClientAddress?: () => string },
	A extends unknown[],
	R
>(handler: (event: E, ...args: A) => R) {
	return (event: E, ...args: A): R => {
		const clientAddress = event.getClientAddress?.() ?? crypto.randomUUID();
		event.locals.api ??= new RemoteClient({
			apiUrl: origin,
			publicOrigin: origin,
			clientAddress,
			token: event.locals.user ? credentials.get(event.locals.user) : undefined,
			fetch: async (input, init) => http.handle(new Request(input, init), { clientAddress })
		});
		return requests.run(event, () => handler(event, ...args));
	};
}
export async function closeWebApplication() {
	await http.closeStreams();
	await lifetime.close();
}
