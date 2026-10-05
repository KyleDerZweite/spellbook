import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';

// Local showcase manifests contain validated filenames; JSON widens their literal types.
export function showcaseAsset(filename: string): string {
	return asset(`showcase/${filename}` as AssetPath);
}
