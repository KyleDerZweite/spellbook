/** Linked device sessions created by approved QR device requests. */
export const DEVICE_TYPES = ['cardstation', 'scanner', 'other'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];
export const DEVICE_NAME_MAX_LENGTH = 64;

// Control, format (including bidirectional overrides) and line/paragraph separators.
const forbidden = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** Mirrors Core normalize_device_name: trimmed, 1 to 64 UTF-16 units, no control characters. */
export function normalizeDeviceName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.trim();
	if (name.length < 1 || name.length > DEVICE_NAME_MAX_LENGTH || forbidden.test(name)) return null;
	return name;
}

export function isDeviceType(value: unknown): value is DeviceType {
	return (DEVICE_TYPES as readonly unknown[]).includes(value);
}

/** Device identity of the current session; null for browser and password sessions. */
export interface SessionDevice {
	id: string;
	name: string | null;
	type: DeviceType | null;
}
export interface LinkedDevice extends SessionDevice {
	createdAt: string;
	lastSeenAt: string;
	expiresAt: string;
}
export interface LinkedDeviceList {
	devices: LinkedDevice[];
}
export interface LinkedDeviceRename {
	name: string;
}
/** Error kind returned with HTTP 403 when a linked device session calls an owner-only route. */
export const DEVICE_SESSION_FORBIDDEN = 'DeviceSessionForbidden';
