import { render } from 'svelte/server';
import { expect, it, vi } from 'vitest';
import InstallApp from '#lib/components/pwa/InstallApp.svelte';
import { parseAppRelease } from '#lib/server/app-release.ts';

const language = vi.hoisted(() => ({ locale: 'en' as 'en' | 'de' }));
vi.mock(import('#lib/i18n/context.ts'), async (original) => {
	const context = await original();
	return { ...context, useLanguage: () => context.createLanguage(() => language.locale) };
});

it.each([
	['en', 'Download Android APK', 'Minimum Android version', 'Add to Home Screen'],
	['de', 'Android-APK herunterladen', 'Mindestversion für Android', 'Zum Home-Bildschirm']
] as const)(
	'renders configured app downloads and install guidance in %s',
	(locale, download, minimum, safari) => {
		language.locale = locale;
		const release = parseAppRelease({
			ANDROID_APK_URL: 'https://downloads.example.test/spellbook.apk',
			ANDROID_APK_VERSION: '1.2.3',
			ANDROID_APK_MIN_ANDROID: 'Android 10',
			ANDROID_APK_SIZE: '24 MB',
			ANDROID_APK_SHA256: 'a'.repeat(64),
			IOS_TESTFLIGHT_URL: 'https://testflight.apple.com/join/example',
			IOS_APP_STORE_URL: 'https://apps.apple.com/app/id123'
		});
		const { body } = render(InstallApp, { props: { release } });
		for (const value of [
			download,
			minimum,
			safari,
			'1.2.3',
			'Android 10',
			'24 MB',
			'a'.repeat(64)
		]) {
			expect(body).toContain(value);
		}
		for (const href of [release.android.href, release.testFlightUrl, release.appStoreUrl]) {
			expect(body).toContain(`href="${href}"`);
		}
	}
);

it('links to GitHub Releases and omits direct-download metadata when the APK URL is unset', () => {
	language.locale = 'en';
	const release = parseAppRelease({ ANDROID_APK_URL: ' ', ANDROID_APK_VERSION: '1.2.3' });
	const { body } = render(InstallApp, { props: { release } });
	expect(body).toContain('href="https://github.com/KyleDerZweite/spellbook/releases/latest"');
	expect(body).toContain('Download Android APK');
	expect(body).toContain('GitHub Releases');
	expect(body).not.toContain('1.2.3');
	expect(body).not.toContain('TestFlight');
	expect(body).not.toContain('App Store');
});

it('rejects app download URLs that do not use HTTPS', () => {
	expect(() => parseAppRelease({ ANDROID_APK_URL: 'javascript:alert(1)' })).toThrow(
		'ANDROID_APK_URL must be a valid HTTPS URL'
	);
});
