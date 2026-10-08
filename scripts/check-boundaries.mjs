import ts from '../frontend/node_modules/typescript/lib/typescript.js';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platformModules = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));
const persistence = /^(pg|drizzle-orm|@aws-sdk\/client-s3)(\/|$)/;

function files(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory())
			return ['node_modules', 'build', '.svelte-kit'].includes(entry.name) ? [] : files(path);
		return /\.(ts|js|mjs|svelte)$/.test(path) ? [path] : [];
	});
}

function importEdges(text, path) {
	if (path.endsWith('.svelte'))
		text = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
			.map((match) => match[1])
			.join('\n');
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
	const imports = [];
	function visit(node) {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteralLike(node.moduleSpecifier)
		) {
			const clause = ts.isImportDeclaration(node) ? node.importClause : node.exportClause;
			const bindings = clause && ts.isImportDeclaration(node) ? clause.namedBindings : clause;
			const names =
				bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
					? bindings.elements.map((binding) => binding.propertyName?.text ?? binding.name.text)
					: undefined;
			if (clause && ts.isImportDeclaration(node) && clause.name) names?.push('default');
			imports.push({ specifier: node.moduleSpecifier.text, names });
		}
		if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteralLike(node.argument.literal)
		)
			imports.push({ specifier: node.argument.literal.text });
		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		)
			imports.push({ specifier: node.arguments[0].text });
		ts.forEachChild(node, visit);
	}
	visit(source);
	return imports;
}

export function importSpecifiers(text, path) {
	return importEdges(text, path).map((edge) => edge.specifier);
}

export function checkBoundaries(root = repository) {
	const policyPath = join(root, 'scripts/boundary-policy.json');
	const policy = existsSync(policyPath) ? JSON.parse(readFileSync(policyPath, 'utf8')) : {};
	const adapters = policy.adapters ?? [];
	const errors = [];
	function compilerOptions(path) {
		const owner = path.startsWith(join(root, 'frontend') + '/')
			? 'frontend'
			: path.startsWith(join(root, 'backend') + '/')
				? 'backend'
				: 'contracts';
		const config = join(root, owner, 'tsconfig.json');
		const configured = existsSync(config)
			? ts.parseJsonConfigFileContent(
					ts.readConfigFile(config, ts.sys.readFile).config,
					ts.sys,
					dirname(config)
				).options
			: {};
		return {
			...configured,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			module: ts.ModuleKind.ESNext,
			allowImportingTsExtensions: true,
			allowArbitraryExtensions: true
		};
	}

	const input = ['frontend/src', 'frontend/scripts', 'backend/src', 'contracts/src'].flatMap(
		(directory) => files(join(root, directory))
	);
	for (const path of input) {
		const file = relative(root, path).replaceAll('\\', '/');
		const browser =
			file.startsWith('frontend/src/') &&
			!file.includes('/lib/server/') &&
			!/(\.server\.|\/\+server\.)/.test(file) &&
			!file.endsWith('/app.d.ts');
		for (const { specifier, names } of importEdges(readFileSync(path, 'utf8'), path)) {
			const host = {
				...ts.sys,
				fileExists: (file) =>
					ts.sys.fileExists(file) ||
					(file.endsWith('.d.svelte.ts') &&
						ts.sys.fileExists(file.replace(/\.d\.svelte\.ts$/, '.svelte')))
			};
			const result = ts.resolveModuleName(specifier, path, compilerOptions(path), host)
				.resolvedModule?.resolvedFileName;
			const resolved = result?.replace(/\.d\.svelte\.ts$/, '.svelte');
			const target = resolved ? relative(root, realpathSync(resolved)).replaceAll('\\', '/') : '';
			const backend = target.startsWith('backend/') || specifier.startsWith('@spellbook/backend');
			const frontend = target.startsWith('frontend/');
			const server =
				backend || target.includes('/lib/server/') || /(\.server\.|\/\+server\.)/.test(target);
			const platform = specifier.startsWith('node:') || platformModules.has(specifier);
			let rule;
			if (!resolved && specifier.startsWith('#')) rule = 'unresolved-alias';
			if (browser && (server || persistence.test(specifier) || platform)) rule = 'browser-server';
			if (
				file.startsWith('backend/') &&
				(frontend ||
					specifier.startsWith('#lib/') ||
					specifier.startsWith('@sveltejs/') ||
					specifier.startsWith('$app/') ||
					specifier.startsWith('$env/') ||
					specifier.startsWith('$lib/') ||
					specifier === 'svelte' ||
					specifier.startsWith('svelte/'))
			)
				rule = 'backend-frontend';
			if (
				file.startsWith('contracts/') &&
				(backend ||
					frontend ||
					platform ||
					(!specifier.startsWith('.') && !specifier.startsWith('@spellbook/contracts')))
			)
				rule = 'contracts-safe';
			const directPersistence =
				persistence.test(specifier) ||
				target === 'frontend/src/lib/server/db/client.ts' ||
				target === 'frontend/src/lib/server/db/schema.ts';
			if (
				file.startsWith('frontend/') &&
				!browser &&
				(directPersistence || backend) &&
				!adapters.some(
					(edge) =>
						edge.file === file &&
						edge.specifier === specifier &&
						backend &&
						!directPersistence &&
						(!edge.allowedNames ||
							(names?.length && names.every((name) => edge.allowedNames.includes(name))))
				)
			)
				rule = 'frontend-persistence';
			if (file.startsWith('frontend/src/') && target.startsWith('frontend/scripts/'))
				rule = 'frontend-operator';
			if (rule) errors.push({ rule, file, specifier, target });
		}
	}
	return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const errors = checkBoundaries();
	for (const error of errors)
		console.error(`${error.rule}: ${error.file} imports ${error.specifier}`);
	if (errors.length) process.exitCode = 1;
	else console.log('Workspace dependency directions passed.');
}
