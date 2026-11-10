import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function markdownFiles(directory = root) {
	return execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'],
		{ cwd: directory, encoding: 'utf8' }
	)
		.split('\0')
		.filter(Boolean)
		.filter((file) => existsSync(resolve(directory, file)));
}

export function checkText(text, width = 100) {
	const failures = [];
	let fence;
	for (const [index, line] of text.split(/\r?\n/).entries()) {
		const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (marker) {
			if (!fence) fence = marker[1];
			else if (
				marker[1][0] === fence[0] &&
				marker[1].length >= fence.length &&
				/^\s*$/.test(line.slice(marker[0].length))
			)
				fence = undefined;
			continue;
		}
		if (fence || /^(?: {4}|\t|\s{0,3}#{1,6}\s)/.test(line) || /^\s*\|.*\|\s*$/.test(line)) continue;
		if (line.length <= width) continue;
		// Replace only indivisible tokens. Surrounding prose still has to fit.
		const reduced = line.replace(
			/(`+)[^`\n]+\1|\[[^\]\n]*\]\([^\s)]+\)|https?:\/\/[^\s<>]+/g,
			(token) => (token.length > width ? 'TOKEN' : token)
		);
		if (reduced.length > width) failures.push({ line: index + 1, length: line.length });
	}
	return failures;
}

function main() {
	const mode = process.argv[2];
	if (!['--check', '--write'].includes(mode) || process.argv.length !== 3)
		throw new Error('Usage: node scripts/docs.mjs --check|--write');
	const files = markdownFiles();
	if (mode === '--write') {
		const result = spawnSync(
			process.execPath,
			[
				resolve(root, 'frontend/node_modules/prettier/bin/prettier.cjs'),
				'--config',
				resolve(root, 'frontend/.prettierrc'),
				'--write',
				'--',
				...files.map((file) => resolve(root, file))
			],
			{ cwd: resolve(root, 'frontend'), stdio: 'inherit' }
		);
		if (result.error) throw result.error;
		process.exitCode = result.status ?? 1;
		return;
	}
	const { printWidth } = JSON.parse(readFileSync(resolve(root, 'frontend/.prettierrc'), 'utf8'));
	for (const file of files) {
		for (const failure of checkText(readFileSync(resolve(root, file), 'utf8'), printWidth)) {
			console.error(
				`${file}:${failure.line}: Markdown source is ${failure.length} characters wide, maximum ${printWidth}`
			);
			process.exitCode = 1;
		}
	}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
