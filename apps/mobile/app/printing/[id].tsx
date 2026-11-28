import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image } from 'react-native';
import type { Schema } from '../../src/api';
import { useInventoryWrites } from '../../src/inventory-writes';
import { useResource } from '../../src/resource';
import { useApp } from '../../src/session';
import {
	Button,
	Copy,
	Gate,
	InventoryWriteStatus,
	Item,
	Loading,
	Pagination,
	Panel,
	Problem,
	Row,
	Screen
} from '../../src/ui';

type Card = Schema<'CardDocument'>;
type Finish = NonNullable<Schema<'InventoryBatchItem'>['finish']>;

function AddPrinting({ printing }: { printing: Card }) {
	const { session, t } = useApp();
	const { status, send } = useInventoryWrites();
	const [selection, setSelection] = useState<Finish>();
	const blocked = status?.phase === 'sending' || status?.phase === 'uncertain';
	const finishes: Finish[] = [];
	if (printing.is_nonfoil_available) finishes.push('nonfoil');
	if (printing.is_foil_available) finishes.push('foil');
	const finish = selection ?? finishes[0];

	const add = () => {
		if (!finish || blocked) return;
		const item = { catalogCardId: printing.id, quantity: 1, finish, condition: 'NM' as const };
		send({
			name: printing.printed_name || printing.name,
			success: 'added',
			perform: (api, requestId) =>
				api('post', '/api/v1/mtg/inventory', {
					body: { requestId, source: 'mobile', items: [item] }
				})
		});
	};

	if (!session) return <Gate />;
	if (!finish)
		return (
			<>
				<Copy kind="muted">{t('noFinish')}</Copy>
				<InventoryWriteStatus />
			</>
		);
	return (
		<Panel>
			<Copy kind="muted">{t('condition')} · NM</Copy>
			<Row>
				{finishes.map((value) => (
					<Button
						key={value}
						label={t(value)}
						selected={finish === value}
						disabled={blocked}
						onPress={() => setSelection(value)}
					/>
				))}
			</Row>
			<Button tone="primary" label={t('add')} disabled={blocked} onPress={add} />
			<InventoryWriteStatus />
		</Panel>
	);
}

function Printings({ card, select }: { card: Card; select: (printing: Card) => void }) {
	const { guestApi, t } = useApp();
	const [offset, setOffset] = useState(0);
	const size = 25;
	const load = useCallback(
		(signal: AbortSignal) =>
			guestApi('get', '/api/v1/mtg/catalog/cards/{oracleId}/printings', {
				path: { oracleId: card.oracle_id },
				query: { limit: size, offset },
				signal
			}),
		[card.oracle_id, guestApi, offset]
	);
	const { state, refresh } = useResource(load);
	if (state.status === 'loading') return <Loading />;
	if (state.status === 'error') return <Problem error={state.error} retry={refresh} />;
	return (
		<>
			<Copy kind="heading">{t('printings')}</Copy>
			{state.data.hits.map((printing) => (
				<Item
					key={printing.id}
					title={printing.set_name || printing.name}
					subtitle={[
						printing.set_code?.toUpperCase(),
						printing.collector_number,
						printing.lang?.toUpperCase()
					]
						.filter(Boolean)
						.join(' · ')}
					image={printing.image_uri_small || printing.image_uri}
					onPress={() => select(printing)}
				/>
			))}
			<Pagination
				offset={offset}
				size={size}
				total={state.data.estimatedTotalHits}
				change={setOffset}
			/>
		</>
	);
}

function Printing({ initial }: { initial: Card }) {
	const { t } = useApp();
	const [printing, setPrinting] = useState(initial);
	const [showPrintings, setShowPrintings] = useState(false);
	return (
		<>
			<Copy kind="title">{printing.printed_name || printing.name}</Copy>
			<Copy kind="muted">
				{[
					printing.set_name,
					printing.set_code?.toUpperCase(),
					printing.collector_number,
					printing.lang?.toUpperCase()
				]
					.filter(Boolean)
					.join(' · ')}
			</Copy>
			{printing.image_uri ? (
				<Image
					source={{ uri: printing.image_uri }}
					accessibilityLabel={printing.name}
					resizeMode="contain"
					style={{ height: 235, alignSelf: 'center', width: 176, borderRadius: 9 }}
				/>
			) : null}
			{printing.type_line ? <Copy kind="heading">{printing.type_line}</Copy> : null}
			{printing.oracle_text ? <Copy>{printing.oracle_text}</Copy> : null}
			<AddPrinting key={printing.id} printing={printing} />
			<Button
				label={t(showPrintings ? 'close' : 'printings')}
				onPress={() => setShowPrintings(!showPrintings)}
			/>
			{showPrintings ? (
				<Printings
					card={initial}
					select={(next) => {
						setPrinting(next);
						setShowPrintings(false);
					}}
				/>
			) : null}
		</>
	);
}

export default function PrintingScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { guestApi, preferences } = useApp();
	const load = useCallback(
		(signal: AbortSignal) =>
			guestApi('get', '/api/v1/mtg/catalog/printings/{printingId}', {
				path: { printingId: id },
				signal
			}),
		[guestApi, id]
	);
	const { state, refresh } = useResource(load, { enabled: !!preferences.origin });
	return (
		<Screen scroll>
			{!preferences.origin ? (
				<Gate />
			) : state.status === 'loading' ? (
				<Loading />
			) : state.status === 'error' ? (
				<Problem error={state.error} retry={refresh} />
			) : (
				<Printing key={state.data.id} initial={state.data} />
			)}
		</Screen>
	);
}
