import type { SelectedDeckContext, SelectedDeckPublication } from './selected-refresh.ts';
import type { ReadLease } from '#lib/saved-state/workspace.ts';

type Route = Omit<SelectedDeckContext, 'inspector' | 'search'>;
type Inspector = NonNullable<SelectedDeckContext['inspector']>;
type Search = NonNullable<SelectedDeckContext['search']>;
type Request = { context: SelectedDeckContext; controller: AbortController; needsRead: boolean };
type Options = {
	route(): Route;
	active(accountId: string): boolean;
	inspector(): Inspector | null;
	search(): { query: string; open: boolean };
	publication(): () => boolean;
	read<T>(path: string, lease: ReadLease): Promise<T | null>;
	ownership(value: NonNullable<SelectedDeckPublication['ownership']>): void;
	results(value: NonNullable<SelectedDeckPublication['search']>): void;
	ownershipStatus(loading: boolean, error: string): void;
	searchStatus(loading: boolean, error: string): void;
};
function sameRoute(a: Route, b: Route) {
	return (
		a.scope === b.scope && a.accountId === b.accountId && a.deckId === b.deckId && a.flow === b.flow
	);
}
function sameInspector(a: Inspector | null, b: Inspector | null) {
	return !!a && !!b && a.opening === b.opening && a.canonicalCardId === b.canonicalCardId;
}
function sameSearch(a: Search | null, b: Search | null) {
	return !!a && !!b && a.opening === b.opening && a.query === b.query;
}

/** Route-owned unanswered reads. Results, drafts and SavedState authority stay with their owners. */
export class SelectedDeckOptionalReads {
	private ownershipRequest?: Request;
	private searchRequest?: Request;
	private searchResume?: { route: Route; query: string };
	private searchOpening = 0;
	private desktop = false;
	private removeMedia?: () => void;
	constructor(private readonly options: Options) {}
	private snapshot(): SelectedDeckContext {
		const route = this.options.route();
		const search = this.options.search();
		return {
			...route,
			inspector: this.options.inspector(),
			search:
				(route.flow === 'search' || search.open || this.desktop) && search.query.trim().length >= 2
					? { query: search.query, opening: this.searchOpening }
					: null
		};
	}
	context(): SelectedDeckContext {
		const context = this.snapshot();
		return {
			...context,
			inspector: context.inspector && {
				...context.inspector,
				needsRead:
					!!this.ownershipRequest?.needsRead && this.matches(this.ownershipRequest, 'inspector')
			},
			search: context.search && {
				...context.search,
				needsRead: !!this.searchRequest?.needsRead && this.matches(this.searchRequest, 'search')
			}
		};
	}
	private matches(request: Request, kind: 'inspector' | 'search') {
		const next = this.snapshot(),
			previous = request.context;
		return (
			this.options.active(next.accountId) &&
			sameRoute(previous, next) &&
			(kind === 'inspector'
				? sameInspector(previous.inspector, next.inspector)
				: sameSearch(previous.search, next.search))
		);
	}
	/** The max-width query must match the route's Desktop sidebar CSS. */
	watchSearchActivity(
		media: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>
	) {
		this.removeMedia?.();
		const update = () => {
			if (this.desktop === !media.matches) return;
			this.desktop = !media.matches;
			this.searchChanged();
		};
		media.addEventListener('change', update);
		this.removeMedia = () => media.removeEventListener('change', update);
		update();
	}
	/** Called synchronously after an opening, query or responsive activity change. */
	searchChanged() {
		const previous = this.searchRequest;
		const next = this.snapshot();
		const query = this.options.search().query;
		const unanswered =
			previous?.needsRead &&
			sameRoute(previous.context, next) &&
			previous.context.search?.query === query;
		const resume = this.searchResume;
		const restart =
			unanswered || (resume && sameRoute(resume.route, next) && resume.query === query);
		this.searchOpening++;
		previous?.controller.abort();
		this.searchRequest = undefined;
		this.searchResume = undefined;
		this.options.searchStatus(false, '');
		if (!restart) return;
		if (this.snapshot().search) void this.readSearch();
		else this.searchResume = { route: next, query: this.options.search().query };
	}
	async submitSearch() {
		this.searchOpening++;
		this.searchResume = undefined;
		await this.readSearch();
	}
	async readOwnership() {
		this.closeInspector();
		const context = this.snapshot();
		if (!context.inspector || !this.options.active(context.accountId)) return;
		const request: Request = { context, controller: new AbortController(), needsRead: true };
		this.ownershipRequest = request;
		const publication = this.options.publication();
		const current = () =>
			this.ownershipRequest === request &&
			!request.controller.signal.aborted &&
			this.matches(request, 'inspector') &&
			publication();
		this.options.ownershipStatus(true, '');
		try {
			const value = await this.options.read<NonNullable<SelectedDeckPublication['ownership']>>(
				`/api/mobile/v1/mtg/decks/ownership?canonicalCardId=${encodeURIComponent(context.inspector.canonicalCardId)}`,
				{ signal: request.controller.signal, current }
			);
			if (value && current()) this.acceptOwnership(value, context.inspector);
		} catch (cause) {
			if (current()) {
				request.needsRead = false;
				this.options.ownershipStatus(
					false,
					cause instanceof Error ? cause.message : 'Owned quantities are unavailable.'
				);
			}
		}
	}
	private async readSearch() {
		this.searchRequest?.controller.abort();
		this.searchRequest = undefined;
		const context = this.snapshot();
		if (!context.search || !this.options.active(context.accountId)) return;
		const request: Request = { context, controller: new AbortController(), needsRead: true };
		this.searchRequest = request;
		const publication = this.options.publication();
		const current = () =>
			this.searchRequest === request &&
			!request.controller.signal.aborted &&
			this.matches(request, 'search') &&
			publication();
		this.options.searchStatus(true, '');
		try {
			const value = await this.options.read<NonNullable<SelectedDeckPublication['search']>>(
				`/api/mobile/v1/mtg/decks/search?q=${encodeURIComponent(context.search.query)}`,
				{ signal: request.controller.signal, current }
			);
			if (value && current()) this.acceptSearch(value, context.search);
		} catch (cause) {
			if (current()) {
				request.needsRead = false;
				this.options.searchStatus(false, cause instanceof Error ? cause.message : 'Search failed.');
			}
		}
	}
	acceptOwnership(value: NonNullable<SelectedDeckPublication['ownership']>, context: Inspector) {
		if (!sameInspector(context, this.snapshot().inspector)) return;
		const request = this.ownershipRequest;
		if (request && this.matches(request, 'inspector')) {
			request.needsRead = false;
			request.controller.abort();
		}
		this.options.ownership(value);
		this.options.ownershipStatus(false, '');
	}
	acceptSearch(value: NonNullable<SelectedDeckPublication['search']>, context: Search) {
		if (!sameSearch(context, this.snapshot().search)) return;
		const request = this.searchRequest;
		if (request && this.matches(request, 'search')) {
			request.needsRead = false;
			request.controller.abort();
		}
		this.options.results(value);
		this.options.searchStatus(false, '');
	}
	closeInspector() {
		this.ownershipRequest?.controller.abort();
		this.ownershipRequest = undefined;
		this.options.ownershipStatus(false, '');
	}
	clear() {
		this.closeInspector();
		this.searchRequest?.controller.abort();
		this.searchRequest = undefined;
		this.searchResume = undefined;
		this.searchOpening++;
		this.options.searchStatus(false, '');
	}
	dispose() {
		this.removeMedia?.();
		this.clear();
	}
}
