import type { PhysicalBox } from '@spellbook/contracts/physical-boxes.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';
import { physicalBoxCondition } from '#lib/mtg/physical-box-form.ts';

export function changePhysicalBoxes(
	boxes: PhysicalBox[],
	intent: string,
	form: FormData
): PhysicalBox[] {
	const id = String(form.get('id') ?? '');
	const name = String(form.get('name') ?? '').trim();
	if (
		(intent === 'create' || intent === 'rename') &&
		(!name || [...name].length > 64 || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\ufffe\uffff]/u.test(name))
	) {
		throw new ValidationError('Invalid Physical Box name');
	}
	switch (intent) {
		case 'create':
			return [...boxes, { id: crypto.randomUUID(), name, condition: null }];
		case 'rename':
			return boxes.map((box) => (box.id === id ? { ...box, name } : box));
		case 'condition': {
			const condition = physicalBoxCondition(form);
			return boxes.map((box) => (box.id === id ? { ...box, condition } : box));
		}
		case 'delete':
			return boxes.filter((box) => box.id !== id);
		default:
			throw new Error('Unknown Physical Box action');
	}
}
