import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { useDebounced, useResource } from '../../src/resource';
import { useApp } from '../../src/session';
import {
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

function CatalogSearch() {
	const { guestApi, t } = useApp();
	const router = useRouter();
	const [query, setQuery] = useState('');
	const q = useDebounced(query.trim());
	const [page, setPage] = useState({ q: '', offset: 0 });
	const offset = page.q === q ? page.offset : 0;
	const load = useCallback(
		(signal: AbortSignal) =>
			guestApi('get', '/api/v1/mtg/catalog/search', {
				query: { q, offset, limit: size },
				signal
			}),
		[guestApi, offset, q]
	);
	const { state, refresh } = useResource(load, { enabled: q.length > 0 });

	return (
		<>
			<Field
				label={t('searchCards')}
				returnKeyType="search"
				value={query}
				onChangeText={setQuery}
				maxLength={300}
			/>
			{!query.trim() ? (
				<Copy kind="muted">{t('searchHelp')}</Copy>
			) : q !== query.trim() || state.status === 'loading' ? (
				<Loading />
			) : state.status === 'error' ? (
				<Problem error={state.error} retry={refresh} />
			) : (
				<FlatList
					key={`${q}:${offset}`}
					data={state.data.hits}
					keyExtractor={(card) => card.id}
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={listStyle}
					ListEmptyComponent={<Copy kind="muted">{t('noCards')}</Copy>}
					ListFooterComponent={
						<Pagination
							offset={offset}
							size={size}
							total={state.data.estimatedTotalHits}
							change={(next) => setPage({ q, offset: next })}
						/>
					}
					renderItem={({ item }) => (
						<Item
							title={item.printed_name || item.name}
							subtitle={[item.type_line, item.set_code?.toUpperCase()].filter(Boolean).join(' · ')}
							image={item.image_uri_small || item.image_uri}
							onPress={() => router.push({ pathname: '/printing/[id]', params: { id: item.id } })}
						/>
					)}
				/>
			)}
		</>
	);
}

export default function SearchScreen() {
	const { t, preferences } = useApp();
	return (
		<Screen inset>
			<Copy kind="title">{t('search')}</Copy>
			{preferences.origin ? <CatalogSearch key={preferences.origin} /> : <Gate />}
		</Screen>
	);
}
