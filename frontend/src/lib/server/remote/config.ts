import { privateEnv } from '#lib/env/private.ts';
import { RemoteUnavailableError } from './errors.ts';

export function remoteConfiguration(url: URL) {
	const env = privateEnv as Record<string, string | undefined>;
	const apiUrl = process.env.API_INTERNAL_URL?.trim() || env.API_INTERNAL_URL?.trim();
	if (!apiUrl) throw new RemoteUnavailableError();
	try {
		const destination = new URL(apiUrl);
		if (
			!['http:', 'https:'].includes(destination.protocol) ||
			destination.username ||
			destination.password ||
			destination.search ||
			destination.hash
		)
			throw new Error();
		const publicOrigin = new URL(
			process.env.APP_ORIGIN?.trim() || env.APP_ORIGIN?.trim() || url.origin
		).origin;
		return { apiUrl: destination.origin, publicOrigin };
	} catch {
		throw new RemoteUnavailableError();
	}
}
