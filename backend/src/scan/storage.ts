import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { checkImage, MAX_IMAGE_BYTES, ScanError } from './validation.ts';
export interface StorageConfiguration {
	storageDriver?: string;
	localStorageDir?: string;
	s3Endpoint?: string;
	s3Region?: string;
	s3Bucket?: string;
	s3AccessKeyId?: string;
	s3SecretAccessKey?: string;
	s3ForcePathStyle?: string;
}
export function createScanStorage(config: StorageConfiguration) {
	let client: S3Client | undefined;
	function target(key: string) {
		if (
			!/^scan-sessions\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(
				key
			)
		)
			throw new ScanError('ScanNotFound', 'Scan image not found', 404);
		const root = resolve(config.localStorageDir ?? '/app/storage/scans');
		const path = resolve(root, key);
		if (!path.startsWith(root + '/'))
			throw new ScanError('ScanNotFound', 'Scan image not found', 404);
		return path;
	}
	function s3() {
		if (!config.s3Endpoint || !config.s3AccessKeyId || !config.s3SecretAccessKey)
			throw new Error('Scan storage is unavailable');
		client ??= new S3Client({
			endpoint: config.s3Endpoint,
			region: config.s3Region ?? 'us-east-1',
			forcePathStyle: config.s3ForcePathStyle !== 'false',
			credentials: {
				accessKeyId: config.s3AccessKeyId,
				secretAccessKey: config.s3SecretAccessKey
			}
		});
		return client;
	}
	return {
		async write(key: string, body: Uint8Array, contentType: string, signal?: AbortSignal) {
			const path = target(key);
			signal?.throwIfAborted();
			if (config.storageDriver === 's3')
				await s3().send(
					new PutObjectCommand({
						Bucket: config.s3Bucket ?? 'spellbook-scans',
						Key: key,
						Body: body,
						ContentType: contentType
					}),
					{ abortSignal: signal }
				);
			else {
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, body, { signal, flag: 'wx' });
			}
			signal?.throwIfAborted();
		},
		async read(key: string, signal?: AbortSignal) {
			const path = target(key);
			signal?.throwIfAborted();
			try {
				const stream =
					config.storageDriver === 's3'
						? (
								await s3().send(
									new GetObjectCommand({
										Bucket: config.s3Bucket ?? 'spellbook-scans',
										Key: key
									}),
									{ abortSignal: signal }
								)
							).Body
						: createReadStream(path, { end: MAX_IMAGE_BYTES, signal });
				if (!stream) throw new ScanError('ScanNotFound', 'Scan image not found', 404);
				const chunks: Uint8Array[] = [];
				let size = 0;
				for await (const chunk of stream as AsyncIterable<Uint8Array>) {
					signal?.throwIfAborted();
					size += chunk.byteLength;
					if (size > MAX_IMAGE_BYTES)
						throw new ScanError('ScanImageInvalid', 'Scan image exceeds 10 MiB', 413);
					chunks.push(chunk);
				}
				const bytes = Buffer.concat(chunks, size);
				return { bytes, contentType: checkImage(bytes) };
			} catch (cause) {
				if (
					cause &&
					typeof cause === 'object' &&
					(('code' in cause && cause.code === 'ENOENT') ||
						('name' in cause && cause.name === 'NoSuchKey'))
				)
					throw new ScanError('ScanNotFound', 'Scan image not found', 404);
				throw cause;
			}
		},
		async delete(key: string) {
			const path = target(key);
			if (config.storageDriver === 's3')
				await s3().send(
					new DeleteObjectCommand({
						Bucket: config.s3Bucket ?? 'spellbook-scans',
						Key: key
					})
				);
			else await rm(path, { force: true });
		},
		close() {
			client?.destroy();
		}
	};
}
