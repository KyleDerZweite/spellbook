import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';

test(
	'built independent API announces its own listener and SIGTERM closes live SSE before exit',
	{
		skip: !process.env.TEST_DATABASE_URL,
		timeout: 30_000
	},
	async (t) => {
		assert.equal(
			process.env.TEST_DATABASE_URL,
			process.env.DATABASE_URL,
			'Use the same disposable database'
		);
		const reservation = createServer();
		reservation.listen(0, '127.0.0.1');
		await once(reservation, 'listening');
		const address = reservation.address();
		assert.ok(address && typeof address !== 'string');
		await new Promise<void>((resolve) => reservation.close(() => resolve()));
		const origin = `http://127.0.0.1:${address.port}`;
		const child = spawn(process.execPath, [new URL('../dist/main.js', import.meta.url).pathname], {
			env: {
				...process.env,
				APP_ORIGIN: origin,
				API_HOST: '127.0.0.1',
				API_PORT: String(address.port),
				VALUE_HISTORY_ENABLED: 'false',
				DEMO_MODE: 'false'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		child.stdout.on('data', (data) => {
			output += data;
		});
		child.stderr.on('data', (data) => {
			output += data;
		});
		const exited = once(child, 'exit');
		let accountId: string | undefined;
		const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
		t.after(async () => {
			if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
			const result = await Promise.race([
				exited.then(() => true),
				delay(15_000, false, { ref: false })
			]);
			assert.equal(
				result,
				true,
				'Task-owned API did not stop gracefully; left running without force termination'
			);
			if (accountId) await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [accountId]);
			await pool.end();
		});
		for (let i = 0; !output.includes(`Listening on ${origin}`) && i < 200; i++) {
			assert.equal(child.exitCode, null, `API exited before its listening event: ${output}`);
			await delay(25);
		}
		assert.ok(
			output.includes(`Listening on ${origin}`),
			output || 'API did not announce its own bound listener'
		);
		const registration = await fetch(`${origin}/api/auth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: `host_${randomUUID().slice(0, 20)}`,
				password: 'host-lifecycle-password'
			})
		});
		assert.equal(registration.status, 201);
		const authenticated = await registration.json();
		accountId = authenticated.user.accountId;
		const stream = await fetch(`${origin}/api/account/events`, {
			headers: { Authorization: `Bearer ${authenticated.token}` }
		});
		assert.equal(stream.status, 200);
		const reader = stream.body!.getReader();
		assert.match(new TextDecoder().decode((await reader.read()).value), /event: reset/);
		assert.equal(child.kill('SIGTERM'), true);
		const [code, signal] = await exited;
		assert.equal(code, 0, output);
		assert.equal(signal, null);
		assert.equal((await reader.read()).done, true);
	}
);
