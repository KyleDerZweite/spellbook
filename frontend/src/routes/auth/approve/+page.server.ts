import { loadQrApproval, submitQrApproval } from '#lib/server/auth/qr-page.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = loadQrApproval;
export const actions: Actions = { default: submitQrApproval };
