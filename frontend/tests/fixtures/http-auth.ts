import { request } from 'node:http';

const addresses = new Map<string, string>();

/** Separate fixture clients use real, stable loopback source addresses, including failed attempts. */
export async function fixtureAuthRequest(
	origin: string,
	path: '/api/auth/login' | '/api/auth/register',
	body: unknown,
	headers: Record<string, string>
): Promise<Response> {
	const username =
		body && typeof body === 'object' && 'username' in body && typeof body.username === 'string'
			? body.username.trim().toLowerCase()
			: '';
	let localAddress = addresses.get(username);
	if (!localAddress) {
		if (addresses.size >= 253) throw new Error('HTTP fixture client address range exhausted.');
		localAddress = `127.0.0.${addresses.size + 2}`;
		addresses.set(username, localAddress);
	}
	const payload = JSON.stringify(body);
	return new Promise((resolve, reject) => {
		const outgoing = request(
			new URL(path, origin),
			{
				method: 'POST',
				localAddress,
				headers: {
					'content-type': 'application/json',
					'content-length': Buffer.byteLength(payload),
					...headers
				}
			},
			(incoming) => {
				const chunks: Buffer[] = [];
				incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
				incoming.on('error', reject);
				incoming.on('end', () => {
					const responseHeaders = new Headers();
					for (let i = 0; i < incoming.rawHeaders.length; i += 2)
						responseHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
					resolve(
						new Response(Buffer.concat(chunks), {
							status: incoming.statusCode,
							headers: responseHeaders
						})
					);
				});
			}
		);
		outgoing.on('error', reject);
		outgoing.end(payload);
	});
}
