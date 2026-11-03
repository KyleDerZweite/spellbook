import { ValidationError } from '@spellbook/contracts/validation.ts';

/** Bound multipart allocation before decoding either native or enhanced uploads. */
export async function readDeckImportForm(request: Request): Promise<FormData> {
	const reader = request.body?.getReader();
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let size = 0;
	try {
		if (reader) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > 1_048_576) {
					await reader.cancel();
					throw new ValidationError('The import form exceeds 1 MiB.');
				}
				chunks.push(value);
			}
		}
		return await new Response(new Blob(chunks), {
			headers: { 'content-type': request.headers.get('content-type') ?? '' }
		}).formData();
	} catch (cause) {
		if (cause instanceof ValidationError) throw cause;
		throw new ValidationError('The import form could not be read.');
	} finally {
		reader?.releaseLock();
	}
}

export async function deckImportText(form: FormData): Promise<string> {
	const upload = form.get('file');
	const pasted = form.get('text');
	if (typeof pasted !== 'string' && pasted !== null)
		throw new ValidationError('Decklist must be text.');
	if (upload instanceof File && upload.size > 0 && pasted?.trim())
		throw new ValidationError('Choose a file or paste text, then preview again.');
	let text = pasted ?? '';
	if (upload instanceof File && upload.size > 0) {
		if (upload.size > 400_000) throw new ValidationError('The file exceeds 400,000 bytes.');
		try {
			text = new TextDecoder('utf-8', { fatal: true }).decode(await upload.arrayBuffer());
		} catch {
			throw new ValidationError('Upload a UTF-8 text, CSV or JSON file.');
		}
	}
	if (!text.trim() || text.length > 100_000)
		throw new ValidationError('Paste or upload a decklist of up to 100,000 characters.');
	return text.trim();
}
