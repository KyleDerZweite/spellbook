import { getRequestEvent } from '$app/server';
import { createRemoteApplication } from './remote/application.ts';

// Each method resolves the current request's client, including a rotated credential.
export const application = createRemoteApplication(() => getRequestEvent().locals.api);
export {
	CategoryNotFound,
	CategoryConflict,
	CategoryMergeConflict,
	LibraryConflict,
	CategoryPreviewExpired,
	CategoryPreviewCapacity,
	CategoryUnavailable
} from './remote/errors.ts';
