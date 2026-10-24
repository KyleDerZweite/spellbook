import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteClient } from '#lib/server/remote/client.ts';
import { submitAuthForm } from '#lib/server/auth/forms.ts';
import { actions as passwordActions } from '../../src/routes/settings/password/+page.server';

const mocks = vi.hoisted(() => ({ revoke: vi.fn() }));
vi.mock('#lib/server/auth/session.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	revokeSession: mocks.revoke
}));
const origin = 'https://spellbook.test';
function setup(path: string, request: Request) {
	const send = vi.fn<typeof fetch>();
	const api = new RemoteClient({
		apiUrl: 'http://api.internal:4000',
		publicOrigin: origin,
		clientAddress: '192.0.2.30',
		token: 'cookie-token',
		signal: request.signal,
		fetch: send
	});
	const cookies = { get: vi.fn(() => 'cookie-token'), set: vi.fn(), delete: vi.fn() };
	const event = {
		url: new URL(path, origin),
		request,
		locals: { user: { accountId: 'account' }, api },
		cookies
	};
	return { event, send, cookies, api };
}
beforeEach(() => vi.clearAllMocks());

describe('streamed credential forms', () => {
	it.each(['login', 'register'] as const)(
		'forwards malformed %s multipart before any web decoding',
		async (mode) => {
			const request = new Request(`${origin}/auth/${mode}`, {
				method: 'POST',
				headers: {
					origin,
					'content-type': 'multipart/form-data; boundary=broken',
					authorization: 'Bearer foreign',
					'x-spellbook-client-address': 'spoofed'
				},
				body: 'not a multipart body'
			});
			const { event, send } = setup(`/auth/${mode}`, request);
			const decoding = vi.spyOn(request, 'formData');
			send.mockResolvedValue(
				Response.json({ message: 'Invalid form body', username: '' }, { status: 400 })
			);
			const result = await submitAuthForm(event as never, mode);
			expect(result).toMatchObject({
				status: 400,
				data: { message: 'Invalid form body', username: '' }
			});
			expect(decoding).not.toHaveBeenCalled();
			expect(String(send.mock.calls[0][0])).toBe(
				`http://api.internal:4000/api/v1/web/auth/${mode}`
			);
			const init = send.mock.calls[0][1]!;
			const headers = new Headers(init.headers);
			expect(init.body).toBe(request.body);
			expect(init.signal).toBe(request.signal);
			expect(headers.get('content-type')).toBe('multipart/form-data; boundary=broken');
			expect(headers.get('cookie')).toBe('spellbook_session=cookie-token');
			expect(headers.get('authorization')).toBeNull();
			expect(headers.get('origin')).toBe(origin);
			expect(headers.get('x-spellbook-client-address')).toBe('192.0.2.30');
			expect(mocks.revoke).not.toHaveBeenCalled();
		}
	);
	it('forwards every invalid password form and preserves the API field DTO and rate limit', async () => {
		const failure = {
			success: false,
			message: 'Check the password fields and try again.',
			errors: {
				currentPassword: 'Enter your current password.',
				newPassword: 'Use 12 to 128 characters for your new password.',
				confirmPassword: 'The new passwords must match.'
			}
		};
		for (let attempt = 0; attempt < 21; attempt++) {
			const request = new Request(`${origin}/settings/password`, {
				method: 'POST',
				headers: { origin },
				body: new URLSearchParams({
					currentPassword: '',
					newPassword: 'short',
					confirmPassword: 'different'
				})
			});
			const { event, send, cookies } = setup('/settings/password', request);
			const decoding = vi.spyOn(request, 'formData');
			send.mockResolvedValue(
				Response.json(
					attempt < 20 ? failure : { message: 'Too many attempts. Try again in 15 minutes.' },
					{ status: attempt < 20 ? 400 : 429 }
				)
			);
			if (attempt < 20)
				expect(await passwordActions.default!(event as never)).toMatchObject({
					status: 400,
					data: failure
				});
			else
				await expect(passwordActions.default!(event as never)).rejects.toMatchObject({
					status: 429,
					body: { message: 'Too many attempts. Try again in 15 minutes.' }
				});
			expect(send).toHaveBeenCalledOnce();
			expect(String(send.mock.calls[0][0])).toBe('http://api.internal:4000/api/v1/web/password');
			expect(send.mock.calls[0][1]?.body).toBe(request.body);
			expect(decoding).not.toHaveBeenCalled();
			expect(cookies.set).not.toHaveBeenCalled();
		}
	});
	it('preserves safe register field failures and the old cookie until successful authentication', async () => {
		const request = new Request(`${origin}/auth/register`, {
			method: 'POST',
			headers: { origin },
			body: new URLSearchParams({ username: 'Mage', password: 'short', artworkId: 'field' })
		});
		const { event, send, cookies } = setup('/auth/register', request);
		const failure = {
			message: 'Unable to create an account with those details.',
			username: 'Mage',
			artworkId: 'field'
		};
		send.mockResolvedValue(Response.json(failure, { status: 400 }));
		expect(await submitAuthForm(event as never, 'register')).toMatchObject({
			status: 400,
			data: failure
		});
		expect(mocks.revoke).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
	});
	it('preserves Demo rejection without replacing the credential or cookie', async () => {
		const request = new Request(`${origin}/settings/password`, {
			method: 'POST',
			headers: { origin },
			body: new URLSearchParams({})
		});
		const { event, send, cookies } = setup('/settings/password', request);
		const failure = {
			success: false,
			message: 'Password changes are disabled in demo mode.',
			errors: {}
		};
		send.mockResolvedValue(Response.json(failure, { status: 403 }));
		expect(await passwordActions.default!(event as never)).toMatchObject({
			status: 403,
			data: failure
		});
		expect(cookies.set).not.toHaveBeenCalled();
	});
});
