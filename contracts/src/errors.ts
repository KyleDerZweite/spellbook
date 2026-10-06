export type ApplicationFailure =
	{ kind: 'ValidationFailed'; message: string } | { kind: 'RateLimited'; message: string };
