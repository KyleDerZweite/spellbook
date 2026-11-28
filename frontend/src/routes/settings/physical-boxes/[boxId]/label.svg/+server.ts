import { error } from '@sveltejs/kit';
import { isPhysicalBoxId, type PhysicalBox } from '@spellbook/contracts/physical-boxes.ts';
import { renderPhysicalBoxLabel } from '#lib/mtg/physical-box-label.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	if (!locals.user) error(401, 'Authentication required');
	if (!isPhysicalBoxId(params.boxId)) error(404, 'Physical Box not found');
	const box = await locals.api.request<PhysicalBox | null>(
		`/api/v1/mtg/physical-boxes/${params.boxId}`,
		{ allowNotFound: true }
	);
	if (!box) error(404, 'Physical Box not found');

	return new Response(await renderPhysicalBoxLabel(box), {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Content-Disposition': `attachment; filename="spellbook-box-${box.id}.svg"`
		}
	});
};
