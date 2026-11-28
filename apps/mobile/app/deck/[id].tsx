import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SectionList, View } from 'react-native';
import type { Schema } from '../../src/api';
import { useResource } from '../../src/resource';
import { useApp } from '../../src/session';
import { Copy, Item, Loading, Panel, Problem, Screen, listStyle } from '../../src/ui';

type DeckCard = Schema<'DeckCard'>;

function Availability({
	cards,
	counts
}: {
	cards: DeckCard[];
	counts: Schema<'DeckSnapshot'>['availability'];
}) {
	const { t } = useApp();
	const missing = cards.flatMap((card) => {
		const quantity = counts[card.id]?.missing ?? 0;
		return quantity > 0 ? [{ card, quantity }] : [];
	});
	const total = missing.reduce((sum, { quantity }) => sum + quantity, 0);

	return (
		<Panel>
			<Copy kind="heading">{t('missing')}</Copy>
			<Copy kind="muted">{total ? `${total} ${t('copies')}` : t('complete')}</Copy>
			{missing.map(({ card, quantity }) => (
				<Copy key={card.id}>
					{quantity} × {card.name}
				</Copy>
			))}
		</Panel>
	);
}

export default function DeckScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { api, colors, t } = useApp();
	const router = useRouter();
	const load = useCallback(
		(signal: AbortSignal) =>
			api('get', '/api/v1/mtg/decks/{deckId}', {
				path: { deckId: id },
				query: { selectedOnly: true, includeLegality: false },
				signal
			}),
		[api, id]
	);
	const { state, refresh } = useResource(load);
	if (state.status === 'loading')
		return (
			<Screen>
				<Loading />
			</Screen>
		);
	if (state.status === 'error')
		return (
			<Screen>
				<Problem error={state.error} retry={refresh} />
			</Screen>
		);
	const deck = state.data.decks.find((value) => value.id === id);
	if (!deck)
		return (
			<Screen>
				<Copy>{t('deckUnavailable')}</Copy>
			</Screen>
		);
	const cards = state.data.deckCards;
	const tokens = state.data.relatedTokens;
	const sections = (['commander', 'main', 'sideboard', 'companion'] as const)
		.map((role) => ({
			role,
			data: cards.filter((card) => card.role === role)
		}))
		.filter((section) => section.data.length || section.role === 'main');

	return (
		<Screen>
			<SectionList
				sections={sections}
				keyExtractor={(card) => card.id}
				contentContainerStyle={listStyle}
				stickySectionHeadersEnabled={false}
				ListHeaderComponent={
					<View style={{ gap: 12, marginBottom: 12 }}>
						<Copy kind="title">{deck.name}</Copy>
						<Copy kind="muted">
							{deck.format} · {t(deck.assembled ? 'assembled' : 'unassembled')}
						</Copy>
						{deck.description ? <Copy>{deck.description}</Copy> : null}
						<Availability cards={cards} counts={state.data.availability} />
					</View>
				}
				renderSectionHeader={({ section }) => (
					<View style={{ paddingVertical: 5, backgroundColor: colors.background }}>
						<Copy kind="heading">
							{t(section.role)} · {section.data.reduce((sum, card) => sum + card.quantity, 0)}
						</Copy>
					</View>
				)}
				renderItem={({ item }) => (
					<Item
						title={item.name}
						subtitle={item.setCode.toUpperCase()}
						image={item.imageUri}
						right={<Copy>{item.quantity}×</Copy>}
						onPress={() =>
							router.push({ pathname: '/printing/[id]', params: { id: item.catalogCardId } })
						}
					/>
				)}
				ListFooterComponent={
					<Panel style={{ marginTop: 12 }}>
						<Copy kind="heading">{t('tokens')}</Copy>
						{tokens.status === 'unavailable' ? (
							<Copy kind="muted">{t('unavailableTokens')}</Copy>
						) : null}
						{tokens.status === 'partial' ? <Copy kind="muted">{t('partialTokens')}</Copy> : null}
						{tokens.status === 'available' && !tokens.items.length ? (
							<Copy kind="muted">{t('noTokens')}</Copy>
						) : null}
						{tokens.items.map((item) => (
							<Item
								key={item.catalogCardId}
								title={item.name}
								image={item.faces[0]?.imageUriSmall ?? item.faces[0]?.imageUri ?? undefined}
								right={<Copy>{item.effectiveQuantity}×</Copy>}
								subtitle={item.setCode.toUpperCase()}
								onPress={() =>
									router.push({ pathname: '/printing/[id]', params: { id: item.catalogCardId } })
								}
							/>
						))}
					</Panel>
				}
			/>
		</Screen>
	);
}
