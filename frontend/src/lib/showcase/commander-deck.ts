import snapshot from './commander-deck.json';

export const commanderDeck = snapshot;

export const commanderStack = snapshot.displayCards.map((name) => {
	const card = snapshot.cards.find((entry) => entry.name === name);
	if (!card?.localImage || !card.imageWidth || !card.imageHeight) {
		throw new Error(`Missing Commander preview image: ${name}`);
	}
	return { ...card, localImage: card.localImage, width: card.imageWidth, height: card.imageHeight };
});
