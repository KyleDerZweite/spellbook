/** Publication ownership for the independently addressed bounded Library list. */
export class CategoryLibraryReadLifetime {
	private context: object = {};
	private key: string;
	private live = true;
	constructor(key: string) {
		this.key = key;
	}
	setKey(key: string) {
		if (key === this.key) return;
		this.key = key;
		this.reopen();
	}
	reopen() {
		this.context = {};
	}
	destroy() {
		this.live = false;
	}
	capture() {
		return { context: this.context, key: this.key };
	}
	current(read: ReturnType<CategoryLibraryReadLifetime['capture']>, key: string) {
		this.setKey(key);
		return this.live && read.context === this.context && read.key === key;
	}
}
