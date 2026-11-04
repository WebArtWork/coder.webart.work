import { HubItem } from './hub.interface';

/** A block of the Practice hub: related modes, two to a row on wider screens. */
export interface HubGroup {
	title: string;
	detail: string;
	items: HubItem[];
}

/**
 * The Practice hub, in order. A new training mode is one more entry here plus its route; put it
 * next to the mode it is most like, so each row pairs two related modes.
 */
export const PRACTICE_GROUPS: HubGroup[] = [
	{
		title: 'Every day',
		detail: 'Today’s puzzle, and what you missed before.',
		items: [
			{
				title: 'Daily puzzle',
				detail: 'One puzzle a day, the same for everyone. Find every good move.',
				path: '/practice/daily',
			},
			{
				title: 'Review',
				detail: 'Missed puzzles come back after 1, 3 and 7 days, plus mistakes from your own games.',
				path: '/practice/review',
			},
		],
	},
	{
		title: 'First steps',
		detail: 'For players who are just starting.',
		items: [
			{
				title: 'Chess basics',
				detail: 'Multiple choice: how the pieces move, what they are worth and how moves are written.',
				path: '/practice/chess-basics',
			},
			{
				title: 'Learn the basics',
				detail: 'The lesson first: the moves, the piece values and how a game is written down.',
				path: '/theory/chess-basics',
			},
		],
	},
	{
		title: 'Tactics',
		detail: 'Mates, combinations and the traps next to them.',
		items: [
			{
				title: 'Mate in 1',
				detail: 'Find the mating move. One try per puzzle.',
				path: '/practice/mate-in-one',
			},
			{
				title: 'Mate in 3',
				detail: 'Play the mating line, move by move.',
				path: '/practice/mate-in-three',
			},
			{
				title: 'Tactics',
				detail: 'Find the best move or play the winning line.',
				path: '/practice/tactics',
			},
			{
				title: 'Is it safe?',
				detail: 'A tempting capture or check: play it or not? If not, show the refutation.',
				path: '/practice/is-it-safe',
			},
		],
	},
	{
		title: 'Calculation',
		detail: 'Find the candidates, then see the lines through.',
		items: [
			{
				title: 'Good moves',
				detail: 'Positions with several good moves. Find them all.',
				path: '/practice/good-moves',
			},
			{
				title: 'Look Ahead',
				detail: 'Calculate three moves deep and find every good line.',
				path: '/practice/look-ahead',
			},
			{
				title: 'See it in your head',
				detail: 'A few moves as text while the board stays still, then a question about the new position.',
				path: '/practice/see-it',
			},
		],
	},
	{
		title: 'Threats and sacrifices',
		detail: 'What your opponent wants, and when giving material pays.',
		items: [
			{
				title: 'What’s the threat?',
				detail: 'Show what your opponent threatens, then find a move that stops it.',
				path: '/practice/threats',
			},
			{
				title: 'Sound sacrifice?',
				detail: 'A sacrifice from a real game: sound, unsound or unclear? Then play the critical reply.',
				path: '/practice/sound-sacrifice',
			},
		],
	},
	{
		title: 'Understanding positions',
		detail: 'Judge a position and name what matters in it.',
		items: [
			{
				title: 'Who is better?',
				detail: 'Rate a quiet position, then see the score and the main imbalance.',
				path: '/practice/who-is-better',
			},
			{
				title: 'Spot the feature',
				detail: 'Tap the isolated pawn, the outpost, the passed pawn or the open file.',
				path: '/practice/spot-the-feature',
			},
		],
	},
	{
		title: 'Openings and endgames',
		detail: 'Start the game well and finish it cleanly.',
		items: [
			{
				title: 'Opening moves',
				detail: 'Moves 4–12 from real games: find the move that follows the principles, or spot the mistake.',
				path: '/practice/opening-moves',
			},
			{
				title: 'Endgame technique',
				detail: 'Endgame puzzles by type: pawn, rook, minor piece, queen, and stalemate traps.',
				path: '/practice/endgames',
			},
		],
	},
];
