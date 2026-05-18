import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { privateEnv } from '$lib/env/private';

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
