import { translate } from '#lib/i18n/messages.ts';
import { normalizeContactEmail } from '@spellbook/contracts/profile.ts';
import { normalizeDeviceName } from '@spellbook/contracts/devices.ts';
import { fail, redirect } from '@sveltejs/kit';
import { isAvatarId } from '#lib/profile/avatars.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { getProfileSettings } from '#lib/server/settings.ts';
import { application } from '#lib/server/composition.ts';
import { RemoteError } from '#lib/server/remote/errors.ts';
import type { Locale } from '#lib/i18n/locale.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
	// A failing device list must not break the rest of Settings.
	const [settings, linked] = await Promise.all([
		getProfileSettings(locals.user),
		application.devices.list().catch(() => null)
	]);
	return { ...settings, devices: linked?.devices ?? [], devicesError: linked === null };
};

async function deviceAction(
	locale: Locale,
	intent: 'device-rename' | 'device-revoke',
	form: FormData
) {
	const deviceId = form.get('deviceId');
	const failure = (
		status: number,
		key:
			| 'notice.This.device.is.no.longer.linked'
			| 'notice.Use.1.to.64.characters.without.control.characters'
			| 'notice.Could.not.update.the.device.Try.again'
	) =>
		fail(status, {
			intent,
			deviceId: typeof deviceId === 'string' ? deviceId : '',
			success: false,
			message: translate(locale, key)
		});
	if (typeof deviceId !== 'string' || !deviceId)
		return failure(404, 'notice.This.device.is.no.longer.linked');
	const name = normalizeDeviceName(form.get('name'));
	if (intent === 'device-rename' && name === null)
		return failure(400, 'notice.Use.1.to.64.characters.without.control.characters');
	if (intent === 'device-revoke' && form.get('confirm') !== 'yes')
		return failure(400, 'notice.Could.not.update.the.device.Try.again');
	try {
		if (intent === 'device-rename') await application.devices.rename(deviceId, name!);
		else await application.devices.revoke(deviceId);
	} catch (cause) {
		if (cause instanceof RemoteError && cause.status === 404)
			return failure(404, 'notice.This.device.is.no.longer.linked');
		if (cause instanceof RemoteError && cause.status === 400)
			return failure(400, 'notice.Use.1.to.64.characters.without.control.characters');
		if (cause instanceof RemoteError && cause.status >= 500)
			return failure(cause.status, 'notice.Could.not.update.the.device.Try.again');
		throw cause;
	}
	return {
		intent,
		deviceId,
		success: true,
		message: translate(
			locale,
			intent === 'device-rename' ? 'notice.Device.renamed' : 'notice.Device.revoked'
		)
	};
}

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
		requireSameOrigin(event);
		const form = await request.formData();
		const intent = form.get('intent');
		const errors: { email?: string; avatarId?: string } = {};
		if (intent === 'device-rename' || intent === 'device-revoke')
			return deviceAction(locals.locale, intent, form);
		if (intent === 'email') {
			const value = form.get('email');
			const email = normalizeContactEmail(value);
			if (email === null) {
				errors.email = translate(
					locals.locale,
					'notice.Enter.a.valid.email.address.or.leave.it.empty'
				);
				return fail(400, {
					intent,
					success: false,
					message: translate(locals.locale, 'notice.Check.the.email.address.and.try.again'),
					errors,
					email: typeof value === 'string' ? value : ''
				});
			}
			locals.user = (await application.profile.patch(locals.user, { email })).user;
			return {
				intent,
				success: true,
				message: translate(locals.locale, 'notice.Email.saved'),
				savedEmail: locals.user.email,
				errors
			};
		}
		if (intent === 'avatar') {
			const avatarId = form.get('avatarId');
			if (!isAvatarId(avatarId)) {
				errors.avatarId = translate(locals.locale, 'notice.Choose.an.avatar.from.the.collection');
				return fail(400, {
					intent,
					success: false,
					message: translate(locals.locale, 'notice.Choose.an.avatar.from.the.collection'),
					errors,
					avatarId: typeof avatarId === 'string' ? avatarId : ''
				});
			}
			locals.user = (await application.profile.patch(locals.user, { avatarId })).user;
			return {
				intent,
				success: true,
				message: translate(locals.locale, 'notice.Avatar.saved'),
				errors
			};
		}
		return fail(400, {
			success: false,
			message: translate(locals.locale, 'notice.Choose.the.preference.to.save'),
			errors
		});
	}
};
