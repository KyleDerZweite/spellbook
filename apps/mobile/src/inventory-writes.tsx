import { randomUUID } from 'expo-crypto';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { writeUnconfirmed, type Api } from './api';

type Write = {
	name: string;
	success: 'added' | 'saved';
	perform: (api: Api, requestId: string) => Promise<unknown>;
};

type Pending = Write & { requestId: string; phase: 'sending' | 'uncertain' };
type Status =
	| Pending
	| { phase: 'done'; name: string; success: Write['success'] }
	| { phase: 'error'; name: string; error: unknown };

const Context = createContext<{
	status?: Status;
	version: number;
	send: (write: Write) => void;
	retry: () => void;
} | null>(null);

export function InventoryWrites({
	api,
	scope,
	children
}: PropsWithChildren<{
	api?: Api;
	scope?: string;
}>) {
	const writes = useMemo(() => ({ status: undefined as Status | undefined, revision: 0 }), [scope]);
	const [, render] = useState(0);
	const publish = (status: Status, settled = false) => {
		writes.status = status;
		if (settled) writes.revision += 1;
		render((value) => value + 1);
	};

	const send = async (write: Pending) => {
		if (!api) return;
		const sending = { ...write, phase: 'sending' as const };
		publish(sending);
		try {
			await sending.perform(api, sending.requestId);
			publish({ phase: 'done', name: sending.name, success: sending.success }, true);
		} catch (error) {
			publish(
				writeUnconfirmed(error)
					? { ...sending, phase: 'uncertain' }
					: { phase: 'error', name: sending.name, error },
				true
			);
		}
	};

	return (
		<Context.Provider
			value={{
				status: writes.status,
				version: writes.revision,
				send: (write) => {
					if (writes.status?.phase === 'sending' || writes.status?.phase === 'uncertain') return;
					void send({ ...write, requestId: randomUUID(), phase: 'sending' });
				},
				retry: () => {
					if (writes.status?.phase === 'uncertain') void send(writes.status);
				}
			}}
		>
			{children}
		</Context.Provider>
	);
}

export function useInventoryWrites() {
	const context = useContext(Context);
	if (!context) throw new Error('InventoryWrites provider is required');
	return context;
}
