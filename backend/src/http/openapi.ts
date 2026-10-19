import document from '../../../contracts/openapi.json' with { type: 'json' };

/** The neutral artifact owns the schema. Only deployment origin varies at runtime. */
export function openapi(publicOrigin: string) {
	return { ...document, servers: [{ url: publicOrigin }] };
}
