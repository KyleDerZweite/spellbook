import { demoMode } from './demo';

export function parseRegistrationEnabled(value: string | undefined): boolean {
	if (value === undefined || value === 'true') return true;
	if (value === 'false') return false;
	throw new Error('REGISTRATION_ENABLED must be true or false');
}

/** Self-service registration. Demo mode and the operator switch both close it. */
export function registrationOpen(
	enabled = parseRegistrationEnabled(process.env.REGISTRATION_ENABLED),
	demo = demoMode
): boolean {
	return enabled && !demo;
}
