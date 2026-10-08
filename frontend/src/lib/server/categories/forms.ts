import { readRequestBytes } from '#lib/server/http/request.ts';
export async function readCategoryForm(request: Request) {
	const bytes = await readRequestBytes(request, 65536);
	return new Request(request.url, {
		method: 'POST',
		headers: request.headers,
		body: bytes
	}).formData();
}
