import { defineEnvVars } from '@sveltejs/kit/env';

const optional = { schema: (value: string | undefined) => value };

export const variables = defineEnvVars({
	APP_ORIGIN: optional,
	API_INTERNAL_URL: optional
});
