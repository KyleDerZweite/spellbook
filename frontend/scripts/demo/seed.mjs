import { pathToFileURL } from 'node:url';
import { seedDemo as seedDemoOperation } from '@spellbook/backend/operators/demo.ts';
import { verifyBundle, bundleBatches } from './catalog-bundle.mjs';
import { precon } from './precon.mjs';

export async function seedDemo() {
	const verified = await verifyBundle();
	const result = await seedDemoOperation(process.env.DATABASE_URL, {
		reset: process.argv.includes('--reset-users'),
		precon,
		bundle: { manifest: verified.manifest, batches: bundleBatches(verified) }
	});
	console.log(result.message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await seedDemo();
