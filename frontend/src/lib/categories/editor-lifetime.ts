/** Completion authority and immutable retry identity for one mounted Library editor. */
export class CategoryEditorLifetime {
	private context: object = {};
	private key: string;
	private live = true;
	private edits = 0;
	private requests = new Map<string, string>();
	constructor(key: string) {
		this.key = key;
	}
	setKey(key: string) {
		if (key === this.key) return false;
		this.key = key;
		this.context = {};
		this.edits = 0;
		this.requests.clear();
		return true;
	}
	reopen() {
		this.context = {};
		this.edits = 0;
		this.requests.clear();
	}
	edit() {
		this.edits++;
	}
	destroy() {
		this.live = false;
		this.requests.clear();
	}
	capture(payload: string, draftIdentity: string, makeId: () => string) {
		const requestId = this.requests.get(payload) ?? makeId();
		this.requests.set(payload, requestId);
		return {
			context: this.context,
			key: this.key,
			edits: this.edits,
			payload,
			draftIdentity,
			requestId
		};
	}
	current(submission: ReturnType<CategoryEditorLifetime['capture']>, key: string) {
		return this.live && submission.context === this.context && submission.key === key;
	}
	unchanged(
		submission: ReturnType<CategoryEditorLifetime['capture']>,
		key: string,
		draftIdentity: string
	) {
		return (
			this.current(submission, key) &&
			submission.edits === this.edits &&
			submission.draftIdentity === draftIdentity
		);
	}
	confirmed(submission: ReturnType<CategoryEditorLifetime['capture']>) {
		this.requests.delete(submission.payload);
	}
}
export function categoryFormIdentity(form: FormData) {
	return JSON.stringify(
		[...form.entries()].filter(([name]) => name !== 'requestId' && name !== 'ruleAction')
	);
}
