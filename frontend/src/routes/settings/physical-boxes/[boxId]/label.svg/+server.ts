import { error } from '@sveltejs/kit';
import {
	isPhysicalBoxId,
	physicalBoxLabelPayload,
	type PhysicalBox
} from '@spellbook/contracts/physical-boxes.ts';
import QRCode from 'qrcode';
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
	const qr = await QRCode.toString(physicalBoxLabelPayload(box.id), {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 4,
		width: 160
	});
	// Wrap before wide glyphs approach the page edges while keeping natural spacing.
	const letters = Array.from(new Intl.Segmenter().segment(box.name), ({ segment }) => segment);
	const lines: string[] = [];
	for (let offset = 0; offset < letters.length; offset += 14) {
		const part = letters.slice(offset, offset + 14);
		const text = part
			.join('')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;');
		lines.push(
			`<text x="120" y="${181 + lines.length * 18}" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle" xml:space="preserve">${text}</text>`
		);
	}
	const height = 194 + lines.length * 18;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="${height}" viewBox="0 0 240 ${height}">
<rect width="240" height="${height}" fill="white"/>
<g transform="translate(40 0)">${qr}</g>
${lines.join('\n')}
<text x="120" y="${height - 11}" font-family="monospace" font-size="12" text-anchor="middle">${box.id.slice(0, 8)}</text>
</svg>`;
	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Content-Disposition': `attachment; filename="spellbook-box-${box.id}.svg"`
		}
	});
};
