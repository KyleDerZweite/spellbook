import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { privateEnv } from '#lib/env/private.ts';

let client: S3Client | null = null;

function getStorageDriver(): 'local' | 's3' {
	return privateEnv.SCAN_STORAGE_DRIVER === 's3' ? 's3' : 'local';
}

function resolveLocalObjectPath(key: string): string {
	const root = resolve(privateEnv.SCAN_LOCAL_STORAGE_DIR ?? '/app/storage/scans');
	const target = resolve(root, key);
	if (!target.startsWith(root + '/')) {
		throw new Error('Scan object key resolved outside the configured storage directory');
	}

	return target;
}

function getClient(): { client: S3Client; bucket: string } {
	if (client) {
		return {
			client,
			bucket: privateEnv.S3_BUCKET ?? 'spellbook-scans'
		};
	}

	const endpoint = privateEnv.S3_ENDPOINT;
	const accessKeyId = privateEnv.S3_ACCESS_KEY_ID;
	const secretAccessKey = privateEnv.S3_SECRET_ACCESS_KEY;
	const bucket = privateEnv.S3_BUCKET ?? 'spellbook-scans';
	const forcePathStyle = privateEnv.S3_FORCE_PATH_STYLE !== 'false';

	if (!endpoint || !accessKeyId || !secretAccessKey) {
		throw new Error(
			'S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required for scan uploads'
		);
	}

	client = new S3Client({
		endpoint,
		region: privateEnv.S3_REGION ?? 'us-east-1',
		forcePathStyle,
		credentials: {
			accessKeyId,
			secretAccessKey
		}
	});

	return {
		client,
		bucket
	};
}

async function uploadLocalScanObject(key: string, body: Uint8Array): Promise<string> {
	const target = resolveLocalObjectPath(key);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, body);
	return key;
}

async function uploadS3ScanObject(
	key: string,
	body: Uint8Array,
	contentType: string
): Promise<string> {
	const { client: s3, bucket } = getClient();
	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: body,
			ContentType: contentType
		})
	);

	return key;
}

export async function uploadScanObject(
	key: string,
	body: Uint8Array,
	contentType: string
): Promise<string> {
	if (getStorageDriver() === 'local') {
		return uploadLocalScanObject(key, body);
	}

	return uploadS3ScanObject(key, body, contentType);
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class ScanImageError extends Error {
	constructor(
		public status: 404 | 413 | 415,
		message: string
	) {
		super(message);
	}
}

export function scanImageContentType(input: Uint8Array): string {
	const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
	if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
		return 'image/png';
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
	if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
		return 'image/webp';
	throw new ScanImageError(415, 'Scan image is not JPEG, PNG, or WebP');
}

export async function readScanImage(
	key: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
	if (!/^scan-sessions\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key)) {
		throw new ScanImageError(404, 'Scan image not found');
	}
	let stream: AsyncIterable<Uint8Array>;
	try {
		if (getStorageDriver() === 'local') {
			stream = createReadStream(resolveLocalObjectPath(key), { end: MAX_IMAGE_BYTES });
		} else {
			const { client: s3, bucket } = getClient();
			const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
			if (!object.Body) throw new ScanImageError(404, 'Scan image not found');
			stream = object.Body as AsyncIterable<Uint8Array>;
		}
		const chunks: Uint8Array[] = [];
		let size = 0;
		for await (const chunk of stream) {
			size += chunk.byteLength;
			if (size > MAX_IMAGE_BYTES) throw new ScanImageError(413, 'Scan image exceeds 10 MiB');
			chunks.push(chunk);
		}
		const bytes = Buffer.concat(chunks, size);
		const contentType = scanImageContentType(bytes);
		return { bytes, contentType };
	} catch (cause) {
		if (
			cause &&
			typeof cause === 'object' &&
			(('code' in cause && cause.code === 'ENOENT') ||
				('name' in cause && cause.name === 'NoSuchKey'))
		) {
			throw new ScanImageError(404, 'Scan image not found');
		}
		throw cause;
	}
}

export async function deleteScanObject(key: string): Promise<void> {
	if (getStorageDriver() === 'local') {
		await rm(resolveLocalObjectPath(key), { force: true });
		return;
	}
	const { client: s3, bucket } = getClient();
	await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
