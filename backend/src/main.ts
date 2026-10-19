import { createApplication } from './application.ts';
import { createHttpApplication } from './http/application.ts';
import { createNodeHttpServer, parseTrustedProxyAddresses } from './http/node.ts';

export async function startApi(env: NodeJS.ProcessEnv = process.env) {
	const publicOrigin = env.APP_ORIGIN?.trim();
	if (!publicOrigin) throw new Error('APP_ORIGIN must be configured');
	const host = env.API_HOST?.trim() || '127.0.0.1';
	const rawPort = env.API_PORT ?? '3001';
	if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)
		throw new Error('API_PORT must be between 1 and 65535');
	const trustedProxyAddresses = parseTrustedProxyAddresses(env.API_TRUSTED_PROXY_ADDRESSES);
	const rawLimit = env.BODY_SIZE_LIMIT || '12M';
	const limit = /^(\d+)([KMG]?)$/i.exec(rawLimit);
	if (!limit)
		throw new Error('BODY_SIZE_LIMIT must be a positive byte count, optionally suffixed K, M or G');
	const maxBodyBytes =
		Number(limit[1]) * 1024 ** (limit[2] ? 'KMG'.indexOf(limit[2].toUpperCase()) + 1 : 0);
	if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1)
		throw new Error('Invalid BODY_SIZE_LIMIT');
	const lifetime = await createApplication({
		databaseUrl: env.DATABASE_URL,
		demoMode: env.DEMO_MODE === 'true',
		valueHistoryTimezone: env.VALUE_HISTORY_TIMEZONE,
		valueHistoryEnabled: env.VALUE_HISTORY_ENABLED,
		commanderSpellbookEnabled: env.COMMANDER_SPELLBOOK_ENABLED,
		scan: {
			storageDriver: env.SCAN_STORAGE_DRIVER,
			localStorageDir: env.SCAN_LOCAL_STORAGE_DIR,
			workerUrl: env.SCAN_WORKER_URL,
			s3Endpoint: env.S3_ENDPOINT,
			s3Region: env.S3_REGION,
			s3Bucket: env.S3_BUCKET,
			s3AccessKeyId: env.S3_ACCESS_KEY_ID,
			s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY,
			s3ForcePathStyle: env.S3_FORCE_PATH_STYLE
		}
	});
	let http: ReturnType<typeof createNodeHttpServer> | undefined;
	let closing: Promise<void> | undefined;
	const close = () =>
		(closing ??= (async () => {
			try {
				await http?.close();
			} finally {
				await lifetime.close();
			}
		})());
	try {
		http = createNodeHttpServer(
			createHttpApplication(lifetime.application, {
				publicOrigin,
				demoMode: env.DEMO_MODE === 'true'
			}),
			{
				publicOrigin,
				trustedProxyAddresses,
				maxBodyBytes
			}
		);
		const address = await http.listen(Number(rawPort), host);
		lifetime.start();
		console.log(
			`Listening on http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`
		);
		return { close, address };
	} catch (cause) {
		await close().catch(() => {});
		throw cause;
	}
}

if (import.meta.main) {
	try {
		const api = await startApi();
		const shutdown = () => {
			void api.close().catch(() => {
				console.error('API shutdown failed');
				process.exitCode = 1;
			});
		};
		process.once('SIGTERM', shutdown);
		process.once('SIGINT', shutdown);
	} catch {
		console.error('API startup failed');
		process.exitCode = 1;
	}
}
