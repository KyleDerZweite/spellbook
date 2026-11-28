import { readDemo } from '#lib/demo/storage.ts';
import type { PhysicalBox } from '@spellbook/contracts/physical-boxes.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, parent, depends }) => {
	const { demoSession } = await parent();
	depends('demo:physical-boxes');
	const boxes =
		typeof window !== 'undefined' && demoSession
			? ((await readDemo<PhysicalBox[]>(demoSession, 'physical-boxes')) ?? data.boxes)
			: data.boxes;
	return { ...data, boxes, seedBoxes: data.boxes };
};
