import type { AppRelease } from '#lib/pwa/app-release.ts';
import { GITHUB_REPOSITORY_URL } from '#lib/social.ts';
import { parseOptionalHttpsUrl } from './optional-https-url.ts';

export function parseAppRelease(
	env: Readonly<Record<string, string | undefined>> = process.env
): AppRelease {
	const apkUrl = parseOptionalHttpsUrl('ANDROID_APK_URL', env.ANDROID_APK_URL);
	return {
		android: apkUrl
			? {
					href: apkUrl,
					direct: true,
					version: env.ANDROID_APK_VERSION?.trim() || undefined,
					minAndroid: env.ANDROID_APK_MIN_ANDROID?.trim() || undefined,
					size: env.ANDROID_APK_SIZE?.trim() || undefined,
					sha256: env.ANDROID_APK_SHA256?.trim() || undefined
				}
			: { href: `${GITHUB_REPOSITORY_URL}/releases/latest`, direct: false },
		testFlightUrl: parseOptionalHttpsUrl('IOS_TESTFLIGHT_URL', env.IOS_TESTFLIGHT_URL),
		appStoreUrl: parseOptionalHttpsUrl('IOS_APP_STORE_URL', env.IOS_APP_STORE_URL)
	};
}

export const configuredAppRelease = parseAppRelease();
