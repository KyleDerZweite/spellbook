// A process-lifecycle fixture only. Application suites use the real built API and web.
import { createServer } from 'node:http';
const api = !!process.env.API_PORT;
const host = api ? process.env.API_HOST : process.env.HOST;
const port = api ? process.env.API_PORT : process.env.PORT;
const server = createServer((_, response) => {
	response.setHeader('content-type', 'application/json');
	response.end(
		JSON.stringify({
			pid: process.pid,
			api,
			publicOrigin: process.env.APP_ORIGIN,
			apiInternalUrl: process.env.API_INTERNAL_URL,
			trustedProxies: process.env.API_TRUSTED_PROXY_ADDRESSES,
			hasDatabase: 'DATABASE_URL' in process.env,
			hasTestDatabase: 'TEST_DATABASE_URL' in process.env,
			hasStorageSecret: 'S3_SECRET_ACCESS_KEY' in process.env,
			hasWorker: 'SCAN_WORKER_URL' in process.env
		})
	);
});
server.listen(Number(port), host, () => console.log(`Listening on http://${host}:${port}`));
process.on('SIGTERM', () => server.close());
