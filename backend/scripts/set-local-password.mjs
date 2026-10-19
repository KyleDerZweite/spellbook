import {
	setLocalPassword,
	normalizeUsername,
	validPassword
} from '@spellbook/backend/operators/local-password.ts';

const [accountId, inputUsername] = process.argv.slice(2);
const username = normalizeUsername(inputUsername);
if (!accountId || !username || !process.env.DATABASE_URL) {
	console.error(
		'Usage: node --env-file=../.env scripts/set-local-password.mjs ACCOUNT_ID USERNAME < password-file'
	);
	process.exit(1);
}
let password = '';
for await (const chunk of process.stdin) {
	password += chunk.toString();
	if (password.length > 130) throw new Error('Password is too long');
}
password = password.replace(/\r?\n$/, '');
if (!validPassword(password)) throw new Error('Password must contain 12 to 128 characters');
const result = await setLocalPassword(process.env.DATABASE_URL, { accountId, username, password });
console.log(result.message);
