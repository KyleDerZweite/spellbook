import { expect, it, vi } from 'vitest';
import pg from 'pg';
import { createApplication } from '@spellbook/backend/application.ts';

it('real application construction and close before start never connect or schedule work', async () => {
	const connectPool = vi.spyOn(pg.Pool.prototype, 'connect');
	const connectListener = vi.spyOn(pg.Client.prototype, 'connect');
	const timeout = vi.spyOn(globalThis, 'setTimeout');
	const interval = vi.spyOn(globalThis, 'setInterval');
	try {
		const lifetime = await createApplication({
			databaseUrl: 'postgres://invalid:unused@localhost:1/unreachable'
		});
		expect(lifetime.application).not.toHaveProperty('db');
		expect(lifetime.application).not.toHaveProperty('pool');
		await lifetime.close();
		expect(connectPool).not.toHaveBeenCalled();
		expect(connectListener).not.toHaveBeenCalled();
		expect(timeout).not.toHaveBeenCalled();
		expect(interval).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
	}
});
