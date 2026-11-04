/** Where people reach us about privacy and their data. */
export const CONTACT_EMAIL = 'ceo@webart.work';

/** This app's source code, published under the GPL. */
export const SOURCE_URL = 'https://github.com/WebArtWork/coder.webart.work';

export interface Credit {
	name: string;
	/** What it does in this app. English; the licenses page translates it, like `author`. */
	use: string;
	author: string;
	license: string;
	url: string;
	/** A local copy of the license text, when we ship one. */
	licenseUrl?: string;
}

/** Third-party work the app ships or shows. The full list of bundled packages is in /3rdpartylicenses.txt. */
export const CREDITS: Credit[] = [
	{
		name: 'Stockfish',
		use: 'The chess engine that checks your moves and analyzes positions.',
		author: 'The Stockfish developers',
		license: 'GPL-3.0',
		url: 'https://github.com/official-stockfish/Stockfish',
		licenseUrl: '/stockfish/Copying.txt',
	},
	{
		name: 'stockfish.js',
		use: 'The build of Stockfish that runs in the browser and the app.',
		author: 'Nathan Rugg and contributors',
		license: 'GPL-3.0',
		url: 'https://github.com/nmrugg/stockfish.js',
		licenseUrl: '/stockfish/Copying.txt',
	},
	{
		name: 'Chessground',
		use: 'The chess board.',
		author: 'Lichess (lichess.org) and contributors',
		license: 'GPL-3.0-or-later',
		url: 'https://github.com/lichess-org/chessground',
	},
	{
		name: 'cburnett pieces',
		use: 'The chess piece images.',
		author: 'Colin M.L. Burnett',
		license: 'GPL-2.0-or-later',
		url: 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces',
	},
	{
		name: 'Lichess game database',
		use: 'The games every puzzle and position comes from.',
		author: 'Lichess (lichess.org) and its players',
		license: 'CC0 (public domain)',
		url: 'https://database.lichess.org',
	},
	{
		name: 'chess.js',
		use: 'Chess rules and move notation.',
		author: 'Jeff Hlywa and contributors',
		license: 'BSD-2-Clause',
		url: 'https://github.com/jhlywa/chess.js',
	},
	{
		name: 'Solar icons',
		use: 'Icons in the light theme.',
		author: '480 Design',
		license: 'CC BY 4.0',
		url: 'https://www.figma.com/community/file/1166831539721848736',
	},
	{
		name: 'Iconoir',
		use: 'Icons in the dark theme.',
		author: 'Luca Burgio and contributors',
		license: 'MIT',
		url: 'https://iconoir.com',
	},
	{
		name: 'Inter and Inter Tight',
		use: 'The fonts, bundled with the app through Fontsource.',
		author: 'Rasmus Andersson',
		license: 'SIL Open Font License 1.1',
		url: 'https://rsms.me/inter/',
	},
	{
		name: 'Angular',
		use: 'The app framework.',
		author: 'Google',
		license: 'MIT',
		url: 'https://angular.dev',
	},
	{
		name: 'Firebase JavaScript SDK',
		use: 'Sign-in and saved data.',
		author: 'Google',
		license: 'Apache-2.0',
		url: 'https://github.com/firebase/firebase-js-sdk',
	},
	{
		name: 'Capacitor',
		use: 'The iOS and Android apps.',
		author: 'Ionic',
		license: 'MIT',
		url: 'https://capacitorjs.com',
	},
	{
		name: 'Tailwind CSS',
		use: 'Styling.',
		author: 'Tailwind Labs',
		license: 'MIT',
		url: 'https://tailwindcss.com',
	},
];
