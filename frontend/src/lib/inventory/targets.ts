type TargetContext = {
	account: string | undefined;
	generation: number;
	active: boolean;
	targets: readonly { id: string; role: string; lifetime: unknown }[];
};
type DetailResponse<T> = {
	status: number;
	ok: boolean;
	json: () => Promise<{ entry: T }>;
};

/** Route-owned detail targets stay independent of the paged query cache. */
export class InventoryTargetReads<T> {
	private request = 0;
	constructor(
		private context: () => TargetContext,
		private transport: (id: string) => Promise<DetailResponse<T>>,
		private apply: (id: string, entry: T | null) => void,
		private unauthenticated: () => void = () => {}
	) {}

	private isCurrent(id: string, request: number, initial: TargetContext) {
		const current = this.context();
		if (
			!current.active ||
			request !== this.request ||
			initial.account !== current.account ||
			initial.generation !== current.generation
		)
			return false;
		const started = initial.targets.filter((target) => target.id === id);
		const active = current.targets.filter((target) => target.id === id);
		return (
			active.length === started.length &&
			active.length > 0 &&
			started.every(
				(target, index) =>
					target.role === active[index].role && target.lifetime === active[index].lifetime
			)
		);
	}

	async refresh(current: () => boolean = () => true) {
		const request = ++this.request;
		const initial = this.context();
		for (const id of new Set(initial.targets.map((target) => target.id))) {
			if (!current() || !this.isCurrent(id, request, initial)) return;
			const response = await this.transport(id);
			if (!current() || !this.isCurrent(id, request, initial)) return;
			if (response.status === 401) {
				this.unauthenticated();
				return;
			}
			if (response.status === 404) {
				this.apply(id, null);
				continue;
			}
			if (!response.ok) throw Error('Saved entry details could not be loaded. Try again.');
			const detail = await response.json();
			if (!current() || !this.isCurrent(id, request, initial)) return;
			this.apply(id, detail.entry);
		}
	}
}
