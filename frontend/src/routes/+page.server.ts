import { randomInt } from 'node:crypto';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ landingSeed: randomInt(0x100000000) });
