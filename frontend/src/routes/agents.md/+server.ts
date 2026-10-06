import type { RequestHandler } from './$types';
import { demoMode } from '#lib/server/auth/demo.ts';

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	const guide = demoMode
		? `# Spellbook agent guide

This deployment is in demo mode. New account registration is disabled. Do not call the registration API or claim that you created an account here.

If the user explicitly asks to explore this shared demo, open [demo login](${origin}/auth/login) and follow the credentials displayed there. Demo activity uses a shared editable account. It does not create a personal account.

For personal registration, ask the user for their intended non-demo Spellbook deployment.
`
		: `# Spellbook agent account registration

Use this guide only when the user asks you to create your own new account on this Spellbook deployment. This is ordinary local account registration, not an OAuth delegation or the auth.md protocol.

The application and API origin is ${origin}. Keep registration and login requests on this origin. Do not forward credentials or authorization headers to another origin, including redirects.

## Prepare the account

Ask the user which username to use unless their chosen username is already known. Usernames contain 3 to 32 ASCII letters, digits, underscores, or hyphens and start with a letter or digit. The server trims and lowercases them. Do not invent an email address or ask for one. Registration has no email field.

Generate a password with a cryptographically secure random generator. Use at least 24 characters; the API accepts 12 to 128 characters. Do not reuse a password or choose a memorable example password.

Choose an available agent or user protected credential store before registration. If none is available, ask the user where to store the credentials before creating the account. Store the origin, selected username, and generated password there before submitting registration so a lost response can be recovered. Never print passwords or tokens in chat, tool output, or logs. Never save plaintext secrets in repository files. Use a request mechanism that keeps secret request bodies, responses, and authorization headers out of logs and shell arguments.

## Register

Send POST ${origin}/api/auth/register with Content-Type: application/json. The JSON body contains exactly username and password, using the selected username and generated password from the protected store. Native clients may omit Origin. If you send Origin, it must equal ${origin}.

HTTP 201 confirms account creation. The JSON response contains user, token, and expiresAt. The user object includes accountId and the normalized username. Save the returned username, accountId, token, and expiresAt in the protected store before reporting success. If storage fails after creation, report the storage failure without exposing secrets or creating a replacement account.

The token is a full-account bearer session with a fixed 30-day lifetime. It has no delegated scopes or refresh token. Protect it like the password. Report only the account username and that credentials were saved, never their values.

## Handle failures

- HTTP 400 is a generic registration failure, including invalid credentials or an unavailable username. Check the documented credential rules. Ask the user for another username if the chosen name is unavailable; do not automatically rename the account.
- HTTP 429 means the authentication limit was reached. Respect Retry-After if present. Otherwise wait for the documented 15-minute attempt window before retrying.
- A network failure or unexpected response can leave account creation uncertain. Try POST ${origin}/api/auth/login with the same stored username and password before submitting registration again. HTTP 200 verifies access to the account and returns user, token, and expiresAt. Store these securely. If login does not verify the account, report the unresolved outcome before attempting another registration. Do not create a second account under a different name.

## Use the account

Use Authorization: Bearer with the stored token for the supported /api/mobile/v1/mtg/ operations. [OpenAPI](${origin}/openapi.json) describes the versioned operations and request schemas. An invalid explicit bearer token fails instead of falling back to a browser cookie. A foreign Origin is rejected by guarded operations; follow the operation's origin and content-type requirements.

When the token expires, sign in through POST ${origin}/api/auth/login with the stored credentials and protect the replacement token. To revoke the current token, send POST ${origin}/api/auth/logout with its Authorization: Bearer header. HTTP 204 confirms logout. Logout revokes this token, not the account or its other sessions.

For browser registration, open [Create account](${origin}/auth/register). The first workspace is [Inventory](${origin}/mtg/inventory). Browser access uses its own login cookie; JSON registration does not set that cookie.
`;
	return new Response(guide, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
