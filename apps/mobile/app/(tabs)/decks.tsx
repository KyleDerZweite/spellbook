import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { useDebounced, useResource } from '../../src/resource';
import { useApp } from '../../src/session';
import {
	Button,
	Copy,
	Field,
	Gate,
	Item,
	Loading,
	Pagination,
	Problem,
	Screen,
	listStyle
} from '../../src/ui';

const size = 40;

function Directory() {
	const { api, t } = useApp();
	const router = useRouter();
	const [query, setQuery] = useState('');
	const q = useDebounced(query.trim());
	const [page, setPage] = useState({ q: '', offset: 0 });
	const offset = page.q === q ? page.offset : 0;
	const load = useCallback(
		(signal: AbortSignal) =>
			api('get', '/api/v1/mtg/deck-library', {
				query: { dirQ: q, offset, limit: size },
				signal
			}),
		[api, offset, q]
	);
	const { state, refresh } = useResource(load);

	return (
		<>
			<Field label={t('searchDecks')} value={query} onChangeText={setQuery} maxLength={200} />
			{state.status === 'loading' || q !== query.trim() ? (
				<Loading />
			) : state.status === 'error' ? (
				<>
					<Problem error={state.error} retry={refresh} />
					{offset > 0 && (
						<Button label={t('previous')} onPress={() => setPage({ q, offset: offset - size })} />
					)}
				</>
			) : (
				<FlatList
					key={`${q}:${offset}`}
					data={state.data.items}
					keyExtractor={(deck) => deck.id}
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={listStyle}
					ListEmptyComponent={<Copy kind="muted">{t('noDecks')}</Copy>}
					ListFooterComponent={
						<Pagination
							offset={offset}
							size={size}
							total={state.data.matchingTotal}
							change={(next) => setPage({ q, offset: next })}
						/>
					}
					renderItem={({ item }) => (
						<Item
							title={item.name}
							subtitle={`${item.format} · ${t(item.assembled ? 'assembled' : 'unassembled')}`}
							image={item.imageUri}
							onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.id } })}
						/>
					)}
				/>
			)}
		</>
	);
}

export default function DecksScreen() {
	const { t, session } = useApp();
	return (
		<Screen inset>
			<Copy kind="title">{t('decks')}</Copy>
			{session ? <Directory key={session.user.accountId} /> : <Gate />}
		</Screen>
	);
}
