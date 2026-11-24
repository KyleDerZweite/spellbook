import type { SortPredicate } from './cardstation-sort-rule.ts';
import { ValidationError } from './validation.ts';

export interface PhysicalBox {
	id: string;
	name: string;
	condition: SortPredicate[] | null;
}

export function isPhysicalBoxId(id: string): boolean {
	return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
}

export function physicalBoxLabelPayload(id: string): string {
	if (!isPhysicalBoxId(id)) throw new ValidationError('Invalid Physical Box ID');
	return `sbx:1:${id}`;
}
