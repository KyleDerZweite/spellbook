import { Minus, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import type { Schema } from '../../src/api';
import { useInventoryWrites } from '../../src/inventory-writes';
import { useDebounced, useResource } from '../../src/resource';
import { useApp } from '../../src/session';
import {
	Button,
	Copy,
	Field,
	Gate,
	InventoryWriteStatus,
	Item,
	Loading,
	Pagination,
	Panel,
	Problem,
	Row,
	Screen,
	listStyle
} from '../../src/ui';

type Entry = Pick<
	Schema<'InventoryWindowEntry'>,
	'id' | 'name' | 'setCode' | 'imageUri' | 'finish' | 'condition' | 'quantity'
>;
type Finish = Schema<'InventoryWindowQuery'>['finish'];
type Condition = Schema<'InventoryWindowQuery'>['condition'];
type Group = Pick<Schema<'InventoryGroupCount'>, 'id' | 'name'>;
type ViewMode = 'cards' | 'groups' | 'boxes';
const size = 50;

function InventoryCards({ group, clearGroup }: { group?: Group; clearGroup: () => void }) {
	const { api, cache, colors, t } = useApp();
	const [query, setQuery] = useState('');
	const [finish, setFinish] = useState<Finish>('all');
	const [condition, setCondition] = useState<Condition>('all');
	const [filters, setFilters] = useState(false);
	const [page, setPage] = useState({ key: '', offset: 0 });
	const { send, status, version } = useInventoryWrites();
	const blocked = status?.phase === 'sending' || status?.phase === 'uncertain';
	const q = useDebounced(query.trim());
	const key = JSON.stringify([q, finish, condition, group?.id]);
	const offset = page.key === key ? page.offset : 0;

	const load = useCallback(
		async (signal: AbortSignal) => {
			const result = await api('get', '/api/v1/mtg/inventory', {
				query: { q, finish, condition, group: group?.id, offset, limit: size },
				signal
			});
			const entries: Entry[] = result.entries.map(
				({ id, name, setCode, imageUri, finish, condition, quantity }) => ({
					id,
					name,
					setCode,
					imageUri,
					finish,
					condition,
					quantity
				})
			);
			return { entries, total: result.matching.entryCount };
		},
		[api, condition, finish, group?.id, offset, q]
	);
	const { state, refresh } = useResource(load, {
		cache,
		cacheKey: `inventory:${key}:${offset}`,
		revision: version
	});

	const change = (entry: Entry, delta: -1 | 1, remove = false) => {
		if (state.status !== 'ready' || state.offline || blocked) return;
		const path = { entryId: entry.id };
		const expectedQuantity = entry.quantity;
		send({
			name: entry.name,
			success: 'saved',
			perform: (api, requestId) =>
				remove
					? api('delete', '/api/v1/mtg/inventory/{entryId}', {
							path,
							body: { requestId, expectedQuantity }
						})
					: api('patch', '/api/v1/mtg/inventory/{entryId}', { path, body: { requestId, delta } })
		});
	};

	const nudge = (entry: Entry, delta: -1 | 1) => {
		if (delta === -1 && entry.quantity === 1) {
			Alert.alert(t('removeLast'), entry.name, [
				{ text: t('cancel'), style: 'cancel' },
				{ text: t('remove'), style: 'destructive', onPress: () => change(entry, delta, true) }
			]);
		} else {
			change(entry, delta);
		}
	};

	return (
		<>
			{group && (
				<Row>
					<Copy kind="heading">{group.name}</Copy>
					<Button label={t('close')} onPress={clearGroup} />
				</Row>
			)}
			<Field label={t('searchInventory')} value={query} onChangeText={setQuery} maxLength={300} />
			<Row>
				<Button label={t('filters')} selected={filters} onPress={() => setFilters(!filters)} />
				<Button label={t('refresh')} disabled={status?.phase === 'sending'} onPress={refresh} />
			</Row>
			{filters && (
				<Panel>
					<Copy kind="muted">{t('finish')}</Copy>
					<Row>
						{(['all', 'nonfoil', 'foil'] as const).map((value) => (
							<Button
								key={value}
								label={t(value)}
								selected={finish === value}
								onPress={() => setFinish(value)}
								compact
							/>
						))}
					</Row>
					<Copy kind="muted">{t('condition')}</Copy>
					<Row>
						{(['all', 'NM', 'LP', 'MP', 'HP', 'DMG'] as const).map((value) => (
							<Button
								key={value}
								label={value === 'all' ? t('all') : value}
								selected={condition === value}
								onPress={() => setCondition(value)}
								compact
							/>
						))}
					</Row>
				</Panel>
			)}
			<InventoryWriteStatus offline={state.status === 'ready' && state.offline} />
			{state.status === 'loading' || q !== query.trim() ? (
				<Loading />
			) : state.status === 'error' ? (
				<>
					<Problem error={state.error} retry={refresh} />
					{offset > 0 && (
						<Button label={t('previous')} onPress={() => setPage({ key, offset: offset - size })} />
					)}
				</>
			) : (
				<>
					{state.offline && <Copy kind="accent">{t('offline')}</Copy>}
					<FlatList
						key={`${key}:${offset}`}
						data={state.data.entries}
						keyExtractor={(entry) => entry.id}
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={listStyle}
						ListEmptyComponent={<Copy kind="muted">{t('noEntries')}</Copy>}
						ListFooterComponent={
							<Pagination
								offset={offset}
								size={size}
								total={state.data.total}
								change={(next) => setPage({ key, offset: next })}
							/>
						}
						renderItem={({ item }) => (
							<Item
								title={item.name}
								subtitle={`${item.setCode.toUpperCase()} · ${t(item.finish)} · ${item.condition}`}
								image={item.imageUri}
								right={
									<View style={{ alignItems: 'center', gap: 3 }}>
										<Copy kind="muted">
											{item.quantity} {t('copies')}
										</Copy>
										<View style={{ flexDirection: 'row', gap: 5 }}>
											<Button
												label={t('minus')}
												icon={<Minus color={colors.text} size={17} />}
												disabled={state.offline || blocked}
												onPress={() => nudge(item, -1)}
												compact
											/>
											<Button
												label={t('plus')}
												icon={<Plus color={colors.text} size={17} />}
												disabled={state.offline || blocked}
												onPress={() => nudge(item, 1)}
												compact
											/>
										</View>
									</View>
								}
							/>
						)}
					/>
				</>
			)}
		</>
	);
}

function Groups({ select }: { select: (group: Group) => void }) {
	const { api, cache, t } = useApp();
	const { version } = useInventoryWrites();
	const [offset, setOffset] = useState(0);
	const load = useCallback(
		(signal: AbortSignal) =>
			api('get', '/api/v1/mtg/inventory/groups', {
				query: { offset, limit: size },
				signal
			}),
		[api, offset]
	);
	const { state, refresh } = useResource(load, {
		cache,
		cacheKey: `groups:${offset}`,
		revision: version
	});
	if (state.status === 'loading') return <Loading />;
	if (state.status === 'error')
		return (
			<>
				<Problem error={state.error} retry={refresh} />
				{offset > 0 && <Button label={t('previous')} onPress={() => setOffset(offset - size)} />}
			</>
		);
	return (
		<>
			{state.offline && <Copy kind="accent">{t('offline')}</Copy>}
			<FlatList
				data={state.data.groups}
				keyExtractor={(item) => item.id}
				contentContainerStyle={listStyle}
				ListEmptyComponent={<Copy kind="muted">{t('noGroups')}</Copy>}
				ListFooterComponent={
					<Pagination offset={offset} size={size} total={state.data.count} change={setOffset} />
				}
				renderItem={({ item }) => (
					<Item
						title={item.name}
						subtitle={`${item.quantity} ${t('copies')}`}
						onPress={() => select(item)}
					/>
				)}
			/>
		</>
	);
}

function Boxes() {
	const { api, cache, session, t } = useApp();
	const load = useCallback(
		(signal: AbortSignal) => api('get', '/api/v1/mtg/physical-boxes', { signal }),
		[api]
	);
	const { state, refresh } = useResource(load, {
		enabled: !session?.device,
		cache,
		cacheKey: 'boxes'
	});
	if (session?.device) return <Copy kind="muted">{t('boxesOwner')}</Copy>;
	if (state.status === 'loading') return <Loading />;
	if (state.status === 'error') return <Problem error={state.error} retry={refresh} />;
	return (
		<>
			{state.offline && <Copy kind="accent">{t('offline')}</Copy>}
			<FlatList
				data={state.data}
				keyExtractor={(item) => item.id}
				contentContainerStyle={listStyle}
				ListEmptyComponent={<Copy kind="muted">{t('noBoxes')}</Copy>}
				renderItem={({ item }) => (
					<Item title={item.name} subtitle={t(item.condition ? 'boxRule' : 'boxManual')} />
				)}
			/>
		</>
	);
}

function Inventory() {
	const { t } = useApp();
	const [view, setView] = useState<ViewMode>('cards');
	const [group, setGroup] = useState<Group>();
	return (
		<>
			<Row>
				{(['cards', 'groups', 'boxes'] as const).map((mode) => (
					<Button
						key={mode}
						label={t(mode)}
						selected={view === mode}
						onPress={() => {
							setView(mode);
							setGroup(undefined);
						}}
					/>
				))}
			</Row>
			{view === 'cards' ? (
				<InventoryCards key={group?.id} group={group} clearGroup={() => setGroup(undefined)} />
			) : view === 'boxes' ? (
				<Boxes />
			) : (
				<Groups
					select={(next) => {
						setGroup(next);
						setView('cards');
					}}
				/>
			)}
		</>
	);
}

export default function InventoryScreen() {
	const { session, t } = useApp();
	return (
		<Screen inset>
			<Copy kind="title">{t('inventory')}</Copy>
			{session ? <Inventory key={session.user.accountId} /> : <Gate />}
		</Screen>
	);
}
