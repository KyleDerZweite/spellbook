const palette: Record<string, string> = {
	o: '#29313e',
	b: '#6389c7',
	B: '#a5c7ef',
	n: '#3e5886',
	s: '#e9bd94',
	S: '#f8dbc0',
	w: '#edf1ef',
	g: '#a3b1bb',
	G: '#dbe3e6',
	r: '#b9585c',
	R: '#e28c83',
	f: '#538e74',
	F: '#99c79a',
	d: '#365e50',
	p: '#8b79b3',
	P: '#c2aedb',
	v: '#5a4d80',
	a: '#c88655',
	A: '#f1bb79',
	l: '#8cbd79',
	L: '#c5e69e',
	m: '#548563',
	y: '#f2d88d'
};

// Original 16px sprites, kept as pixel maps so the art stays easy to edit.
const sprites = [
	{
		id: 'wizard',
		label: 'Wizard',
		pixels: [
			'................',
			'........oo......',
			'.......oBbo.....',
			'......oBBbno....',
			'......oBbbno....',
			'.....oBbybbno...',
			'....oBBbbbnnno..',
			'..ooBBBBbbnnnno.',
			'..oooooooooooo..',
			'....oSossoso....',
			'....owwsswwo....',
			'...onwSwwSwno...',
			'...obnwwwwnbo...',
			'..oBbbnwwnbbno..',
			'..obbbnnnnbbno..',
			'...oooooooooo...'
		]
	},
	{
		id: 'knight',
		label: 'Knight',
		pixels: [
			'................',
			'......oooo......',
			'.....oRRrro.....',
			'.....oRrro......',
			'....ooggooo.....',
			'...oGGGGgggo....',
			'...oGGGggggo....',
			'...oGGoooooo....',
			'...oGGGggggo....',
			'...ogGogoggo....',
			'....ogogogo.....',
			'...ooogggooo....',
			'..oGGGorroGgo...',
			'.oGGgGorroGggo..',
			'.ogggGorroGggo..',
			'..ooooooooooo...'
		]
	},
	{
		id: 'ranger',
		label: 'Ranger',
		pixels: [
			'................',
			'..........oo....',
			'.........oFwo...',
			'......ooooFo....',
			'.....oFFffo.....',
			'....oFFfffdo....',
			'...oFFffffddo...',
			'..offffffffddo..',
			'...ooSSssssoo...',
			'....oSossoso....',
			'....oSSssso.....',
			'...oofSsofoo....',
			'..oFffoofffdo...',
			'..oFffayfffdo...',
			'..offffayffdo...',
			'...ooooooooo....'
		]
	},
	{
		id: 'rogue',
		label: 'Rogue',
		pixels: [
			'................',
			'.......oo.......',
			'.....ooPpoo.....',
			'....oPPpppvo....',
			'...oPPppppvvo...',
			'...oPppppvvvo...',
			'..oPppooppvvvo..',
			'..oppoggooovvo..',
			'..opgoGooGogvo..',
			'..opvoooooovvo..',
			'...ovpppppvvo...',
			'...oovpppvooo...',
			'..oppoovvoopvo..',
			'..oPppogoppvvo..',
			'..oppppoopvvvo..',
			'...oooooooooo...'
		]
	},
	{
		id: 'dragon',
		label: 'Dragon',
		pixels: [
			'................',
			'...oo......oo...',
			'...oGo....oGo...',
			'...oGaooooAGo...',
			'....oAAAAaao....',
			'...oAAAaaaaao...',
			'..oaAAaaaaaaao..',
			'.ooaAoaaaaoaaoo.',
			'.oaaAyAAAAyaaao.',
			'..oAAAoaaoAAao..',
			'...oAAAAAAAao...',
			'....oaowwoao....',
			'...oaAoAAoAao...',
			'..oaaAAGGAaaao..',
			'..oaaaAGGaaaao..',
			'...oooooooooo...'
		]
	},
	{
		id: 'slime',
		label: 'Slime',
		pixels: [
			'................',
			'................',
			'................',
			'........oo......',
			'......ooLlo.....',
			'.....oLLLllo....',
			'....oLwwLlllo...',
			'...oLwwLlllllo..',
			'...oLLLLlllllo..',
			'..oLLollllolllo.',
			'..oLLollllolllo.',
			'..oLLlllllllmmo.',
			'.olLLlloollllmmo',
			'.omlllllllllmmmo',
			'..ommmmmmmmmmmo.',
			'...ooooooooooo..'
		]
	}
] as const;

export type AvatarId = (typeof sprites)[number]['id'];

export const DEFAULT_AVATAR_ID: AvatarId = 'wizard';

export const AVATARS = sprites.map(({ id, label, pixels }) => ({
	id,
	label,
	paths: Object.entries(palette).flatMap(([pixel, fill]) => {
		const d = pixels
			.flatMap((row, y) =>
				Array.from(row, (value, x) => (value === pixel ? `M${x} ${y}h1v1h-1z` : ''))
			)
			.join('');
		return d ? [{ fill, d }] : [];
	})
})) as readonly {
	id: AvatarId;
	label: string;
	paths: readonly { fill: string; d: string }[];
}[];

export function isAvatarId(value: unknown): value is AvatarId {
	return typeof value === 'string' && AVATARS.some((avatar) => avatar.id === value);
}

export function getAvatar(value: unknown) {
	return AVATARS.find((avatar) => avatar.id === value) ?? AVATARS[0]!;
}
