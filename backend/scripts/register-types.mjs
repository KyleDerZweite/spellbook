import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

// Test-only transformation. Production always executes dist/main.js.
registerHooks({
	load(url, context, nextLoad) {
		if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context);
		const sourcefile = fileURLToPath(url);
		const { code } = transformSync(readFileSync(sourcefile, 'utf8'), {
			loader: 'ts',
			format: 'esm',
			target: 'node26',
			sourcemap: 'inline',
			sourcefile
		});
		return { format: 'module', source: code, shortCircuit: true };
	}
});
