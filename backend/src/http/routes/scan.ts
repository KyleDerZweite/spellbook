import type { HttpDependencies, HttpRoute } from '../types.ts';
import { error, json, badRequestIfValidation } from '../errors.ts';
import { requireMobileAuth } from '../auth.ts';
import { readJsonObject, readRequestBytes, requireUuid } from '../request.ts';
import type { ScanStatus, ScanCommitInput } from '@spellbook/contracts/scan.ts';

function scanHttpError(cause: unknown): never {
	if (
		cause &&
		typeof cause === 'object' &&
		'kind' in cause &&
		'status' in cause &&
		'message' in cause &&
		typeof cause.status === 'number' &&
		typeof cause.message === 'string' &&
		typeof cause.kind === 'string' &&
		[
			'ScanNotFound',
			'ScanClosed',
			'ScanProcessingFailed',
			'ScanUnavailable',
			'LegacyReplayEvidenceRequired',
			'ScanImageInvalid'
		].includes(cause.kind)
	)
		error(cause.status, {
			kind: cause.kind as import('@spellbook/contracts/scan.ts').ScanFailure['kind'],
			message: cause.message
		});
	badRequestIfValidation(cause);
}

export function createScanRoutes(deps: HttpDependencies): HttpRoute[] {
	const { application } = deps;
	const createSession: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		try {
			return json(
				{ session: await application.scan.createSession(auth.user) },
				{ headers: { 'Cache-Control': 'no-store' } }
			);
		} catch (cause) {
			scanHttpError(cause);
		}
	};
	const listSessions: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		try {
			return json(
				{ sessions: await application.scan.listSessions(auth.user) },
				{ headers: { 'Cache-Control': 'no-store' } }
			);
		} catch (cause) {
			scanHttpError(cause);
		}
	};
	const uploadFrame: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps),
			sessionId = requireUuid(context.params.sessionId, 'sessionId');
		try {
			await application.scan.assertUploadable(auth.user, sessionId);
			if (
				context.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
				'multipart/form-data'
			)
				error(415, 'Scan uploads require multipart/form-data');
			const bytes = await readRequestBytes(context.request, 12 * 1024 * 1024);
			let form: FormData;
			try {
				form = await new Request(context.request.url, {
					method: 'POST',
					headers: context.request.headers,
					body: bytes
				}).formData();
			} catch {
				error(400, 'Malformed multipart upload');
			}
			const file = form.get('file');
			if (!(file instanceof File)) error(400, 'multipart file field "file" is required');
			return json(
				await application.scan.uploadFrame(
					auth.user,
					{
						sessionId,
						bytes: new Uint8Array(await file.arrayBuffer()),
						contentType: file.type,
						fileName: file.name
					},
					context.request.signal
				),
				{ headers: { 'Cache-Control': 'no-store' } }
			);
		} catch (cause) {
			scanHttpError(cause);
		}
	};
	const readSession: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const raw = context.url.searchParams.get('limit');
		if (raw !== null && !/^\d+$/.test(raw)) error(400, 'Invalid Scan page limit');
		try {
			return json(
				await application.scan.readSession(auth.user, {
					sessionId: requireUuid(context.params.sessionId, 'sessionId'),
					limit: raw === null ? undefined : Number(raw),
					artifactCursor: context.url.searchParams.get('artifactCursor') ?? undefined,
					reviewCursor: context.url.searchParams.get('reviewCursor') ?? undefined
				}),
				{ headers: { 'Cache-Control': 'no-store' } }
			);
		} catch (cause) {
			scanHttpError(cause);
		}
	};
	const submitResult: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.scan.submitResult(auth.user, {
					sessionId: requireUuid(context.params.sessionId, 'sessionId'),
					artifactId: requireUuid(context.params.artifactId, 'artifactId'),
					status: body.status as ScanStatus,
					modelVersion: body.modelVersion as string,
					candidates: body.candidates as {
						catalogCardId: string;
						confidence: number;
						notes?: string;
					}[]
				}),
				{ headers: { 'Cache-Control': 'no-store' } }
			);
		} catch (cause) {
			scanHttpError(cause);
		}
	};
	const readImage: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		try {
			const { bytes, contentType } = await application.scan.readImage(
				auth.user,
				requireUuid(context.params.artifactId, 'artifactId'),
				context.request.signal
			);
			return new Response(new Uint8Array(bytes), {
				headers: {
					'Content-Type': contentType,
					'Content-Length': String(bytes.byteLength),
					'Cache-Control': 'no-store',
					'X-Content-Type-Options': 'nosniff'
				}
			});
		} catch (cause) {
			scanHttpError(cause);
		}
	};
	const commitReview: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		// Explicit legacy verification is accepted only by Backend's existing-receipt path.
		try {
			return json(
				await application.scan.commitReview(
					auth.user,
					body as unknown as ScanCommitInput,
					context.request.signal
				),
				{ headers: { 'Cache-Control': 'no-store' } }
			);
		} catch (cause) {
			scanHttpError(cause);
		}
	};
	return [
		{ method: 'POST', path: '/api/mobile/v1/mtg/scan/sessions', handle: createSession },
		{ method: 'GET', path: '/api/mobile/v1/mtg/scan/sessions', handle: listSessions },
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/scan/sessions/:sessionId/frames',
			handle: uploadFrame
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/scan/sessions/:sessionId/result',
			handle: readSession
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/scan/sessions/:sessionId/artifacts/:artifactId/result',
			handle: submitResult
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/scan/artifacts/:artifactId/image',
			handle: readImage
		},
		{ method: 'POST', path: '/api/mobile/v1/mtg/scan/review/commit', handle: commitReview }
	];
}
