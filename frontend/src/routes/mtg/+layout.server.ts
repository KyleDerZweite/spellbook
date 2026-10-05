import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = () => ({ activeGame: 'mtg' as const });
