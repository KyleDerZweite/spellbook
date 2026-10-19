/** Browser field validation only. Password hashing and verification belong to the API. */
export function validPassword(value: unknown): value is string {
	return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
