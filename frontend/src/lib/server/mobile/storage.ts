import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { privateEnv } from '$lib/env/private';

let client: S3Client | null = null;

function getClient(): { client: S3Client; bucket: string } {
	if (client) {
		return {
			client,
			bucket: privateEnv.MINIO_BUCKET ?? 'spellbook-scans'
		};
	}

	const endpoint = privateEnv.MINIO_ENDPOINT;
	const accessKeyId = privateEnv.MINIO_ACCESS_KEY;
	const secretAccessKey = privateEnv.MINIO_SECRET_KEY;
	const bucket = privateEnv.MINIO_BUCKET ?? 'spellbook-scans';

	if (!endpoint || !accessKeyId || !secretAccessKey) {
		throw new Error(
			'MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY are required for scan uploads'
		);
	}

	client = new S3Client({
		endpoint,
		region: privateEnv.MINIO_REGION ?? 'us-east-1',
		forcePathStyle: true,
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

export async function uploadScanObject(
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
