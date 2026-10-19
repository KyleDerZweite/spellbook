import type { Application } from '../application.ts';

/** HTTP-only dependencies. Account authority is established from credentials per request. */
export interface HttpDependencies {
	application: Application;
	publicOrigin: string;
}

export interface HttpRequestMetadata {
	clientAddress: string;
}

export interface RouteContext extends HttpRequestMetadata {
	request: Request;
	url: URL;
	params: Readonly<Record<string, string>>;
}

export interface HttpRoute {
	method: string;
	/** Literal path with named segments, for example /api/decks/:deckId. */
	path: string;
	handle(context: RouteContext): Promise<Response>;
}

export interface HttpApplication {
	handle(request: Request, metadata: HttpRequestMetadata): Promise<Response>;
	closeStreams(): Promise<void>;
}
