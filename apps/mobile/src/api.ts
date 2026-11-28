import { fetch } from 'expo/fetch';
import type { File } from 'expo-file-system';
import type { components, paths } from './api.generated';

export type Schema<K extends keyof components['schemas']> = components['schemas'][K];

type Method = 'get' | 'post' | 'patch' | 'delete';
type Route<M extends Method> = {
	[P in keyof paths]: paths[P][M] extends undefined ? never : P;
}[keyof paths];

type Operation<M extends Method, P extends Route<M>> = NonNullable<paths[P][M]>;
type JsonResponse<O> = O extends { responses: infer R }
	? {
			[Status in keyof R]: Status extends 200 | 201
				? R[Status] extends { content: { 'application/json': infer Body } }
					? Body
					: void
				: Status extends 204
					? void
					: never;
		}[keyof R]
	: never;

type Options<M extends Method, P extends Route<M>, O = Operation<M, P>> = {
	signal?: AbortSignal;
} & (paths[P]['parameters'] extends { path: infer Params } ? { path: Params } : { path?: never }) &
	(O extends { parameters: { query?: infer Query } } ? { query?: Query } : { query?: never }) &
	(O extends { requestBody: { content: { 'application/json': infer Body } } }
		? { body: Body; contentType?: never }
		: P extends '/api/v1/mtg/scan/sessions/{sessionId}/frames'
			? { body: File; contentType: 'image/jpeg' }
			: { body?: never; contentType?: never });

export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly kind?: string
	) {
		super(`HTTP ${status}`);
	}
}

export class NetworkError extends Error {}
export class InvalidResponse extends Error {}

export function createApi(
	origin: string,
	token?: string,
	expired?: () => void,
	lifetime?: AbortSignal
) {
	return async function request<M extends Method, P extends Route<M>>(
		method: M,
		route: P,
		options: Options<M, P>
	): Promise<JsonResponse<Operation<M, P>>> {
		const signal = AbortSignal.any([
			AbortSignal.timeout(45_000),
			...[lifetime, options.signal].filter((value): value is AbortSignal => !!value)
		]);
		const pathname = route.replace(/\{(\w+)\}/g, (_, key: string) => {
			const value = (options.path as Record<string, string> | undefined)?.[key];
			if (!value) throw new InvalidResponse();
			return encodeURIComponent(value);
		});
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(options.query ?? {})) {
			if (value == null) continue;
			for (const item of Array.isArray(value) ? value : [value]) query.append(key, String(item));
		}
		const headers = new Headers({ Accept: 'application/json' });
		if (token) headers.set('Authorization', `Bearer ${token}`);
		if (options.body !== undefined)
			headers.set('Content-Type', options.contentType ?? 'application/json');
		let response;
		try {
			response = await fetch(`${origin}${pathname}${query.size ? `?${query}` : ''}`, {
				method: method.toUpperCase(),
				headers,
				body: options.contentType ? (options.body as File) : JSON.stringify(options.body),
				credentials: 'omit',
				redirect: 'error',
				signal
			});
		} catch (error) {
			if (options.signal?.aborted || lifetime?.aborted) throw error;
			throw new NetworkError();
		}
		if (response.status === 401) expired?.();
		if (!response.ok) {
			const body: Partial<Schema<'ErrorResponse'>> | null = await response.json().catch(() => null);
			throw new HttpError(response.status, body?.kind);
		}
		if (response.status === 204) return undefined as JsonResponse<Operation<M, P>>;
		if (!response.headers.get('content-type')?.includes('application/json'))
			throw new InvalidResponse();
		let text: string;
		try {
			text = await response.text();
		} catch (error) {
			if (options.signal?.aborted || lifetime?.aborted) throw error;
			throw new NetworkError();
		}
		return JSON.parse(text) as JsonResponse<Operation<M, P>>;
	};
}

export type Api = ReturnType<typeof createApi>;

export function writeUnconfirmed(error: unknown) {
	return !(error instanceof HttpError) || error.status >= 500;
}
