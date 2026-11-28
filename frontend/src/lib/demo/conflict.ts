export class DemoDraftConflict extends Error {}

export class DemoSessionChanged extends Error {}

export function demoSaveError(
	cause: unknown
): 'demo.draftConflict' | 'demo.sessionChanged' | 'ui.Could.not.save.Try.again' {
	if (cause instanceof DemoDraftConflict) return 'demo.draftConflict';
	if (cause instanceof DemoSessionChanged) return 'demo.sessionChanged';
	return 'ui.Could.not.save.Try.again';
}
