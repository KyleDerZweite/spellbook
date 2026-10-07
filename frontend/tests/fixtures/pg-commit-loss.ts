import { createServer, connect, type Socket } from 'node:net';
import pg from 'pg';
/** Actual assigned PostgreSQL. Drop its first completed COMMIT response without decoding/logging credentials. */
export async function commitResponseLoss(databaseUrl: string, onCompleted?: () => Promise<void>) {
	const assigned = new URL(databaseUrl);
	if (
		databaseUrl !== process.env.TEST_DATABASE_URL ||
		assigned.pathname !==
			'/' +
				(process.env.TEST_SCAN_DATABASE_NAME ??
					(process.env.CI ? 'spellbook_test' : 'spellbook_scan_contracts_07_20261007'))
	)
		throw new Error('Assigned Scan database guard failed');
	const sockets = new Set<Socket>();
	let dropped = false;
	const server = createServer((client) => {
		sockets.add(client);
		const upstream = connect({ host: assigned.hostname, port: Number(assigned.port || 5432) });
		sockets.add(upstream);
		let buffered = Buffer.alloc(0);
		client.on('data', (data) => upstream.write(data));
		upstream.on('data', (data: Buffer) => {
			buffered = Buffer.concat([buffered, data]);
			while (buffered.length >= 5) {
				const size = buffered.readInt32BE(1) + 1;
				if (size < 5 || size > 16 * 1024 * 1024) {
					client.destroy();
					upstream.destroy();
					return;
				}
				if (buffered.length < size) return;
				const message = buffered.subarray(0, size);
				buffered = buffered.subarray(size);
				if (!dropped && message[0] === 67 && message.subarray(5).equals(Buffer.from('COMMIT\0'))) {
					dropped = true;
					const disconnect = () => {
						client.destroy();
						upstream.destroy();
					};
					if (onCompleted) void onCompleted().then(disconnect, disconnect);
					else disconnect();
					return;
				}
				client.write(message);
			}
		});
		const dispose = () => {
			sockets.delete(client);
			sockets.delete(upstream);
			client.destroy();
			upstream.destroy();
		};
		client.on('error', dispose);
		upstream.on('error', dispose);
		client.on('close', dispose);
		upstream.on('close', dispose);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('PG proxy did not bind');
	const proxied = new URL(databaseUrl);
	proxied.hostname = '127.0.0.1';
	proxied.port = String(address.port);
	const pool = new pg.Pool({ connectionString: proxied.href, connectionTimeoutMillis: 5000 });
	return {
		pool,
		dropped: () => dropped,
		async close() {
			await pool.end();
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	};
}
