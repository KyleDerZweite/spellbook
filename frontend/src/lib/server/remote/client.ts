import { decodeRemoteError, RemoteUnavailableError, type ErrorDomain } from './errors.ts';

export const SESSION_COOKIE = 'spellbook_session';
export const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

export interface RemoteClientOptions {
	apiUrl: string;
	publicOrigin: string;
	clientAddress: string;
	token?: string;
	signal?: AbortSignal;
	fetch?: typeof fetch;
}

export class RemoteClient {
	private token: string | undefined;
	constructor(private readonly options: RemoteClientOptions) {
		this.token = options.token;
	}
	replaceToken(token: string | undefined) {
		this.token = token;
	}
	async request<T>(
		path: string,
		options: {
			method?: string;
			body?: unknown;
			domain?: ErrorDomain;
			token?: string;
			bearer?: boolean;
			text?: boolean;
			allowNotFound?: boolean;
			revisionResult?: boolean;
		} = {}
	): Promise<T> {
		const headers = new Headers({
			accept: options.text ? 'text/plain' : 'application/json',
			origin: this.options.publicOrigin
		});
		headers.set('X-Spellbook-Client-Address', this.options.clientAddress);
		// An explicit override is used only by login/logout/session lifecycle operations.
		const token = Object.hasOwn(options, 'token') ? options.token : this.token;
		if (token) {
			if (options.bearer) headers.set('authorization', `Bearer ${token}`);
			else headers.set('cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}`);
		}
		if (options.body !== undefined) headers.set('content-type', 'application/json');
		let response: Response;
		try {
			response = await (this.options.fetch ?? fetch)(new URL(path, this.options.apiUrl), {
				method: options.method ?? 'GET',
				headers,
				...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
				signal: this.options.signal,
				redirect: 'manual',
				cache: 'no-store'
			});
		} catch {
			if (this.options.signal?.aborted) throw this.options.signal.reason;
			throw new RemoteUnavailableError();
		}
		if (response.status === 404 && options.allowNotFound) {
			await response.body?.cancel();
			return null as T;
		}
		if (response.status === 204) return undefined as T;
		if (response.ok && options.text) {
			try {
				return (await response.text()) as T;
			} catch {
				throw new RemoteUnavailableError();
			}
		}
		let value: unknown;
		try {
			value = await response.json();
		} catch {
			throw new RemoteUnavailableError();
		}
		if (response.ok) return value as T;
		if (
			response.status === 409 &&
			options.revisionResult &&
			value &&
			typeof value === 'object' &&
			'kind' in value &&
			value.kind === 'RevisionChanged' &&
			'revision' in value &&
			typeof value.revision === 'string'
		)
			return value as T;
		throw decodeRemoteError(response.status, value, options.domain);
	}
}

export function queryPath(
	path: string,
	input: object = {},
	aliases: Record<string, string> = {}
): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null) continue;
		for (const item of Array.isArray(value) ? value : [value])
			query.append(aliases[key] ?? key, String(item));
	}
	return `${path}${query.size ? `?${query}` : ''}`;
}
