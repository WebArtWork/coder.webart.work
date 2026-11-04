import { PracticeKind } from './practice.interface';

/** Where each practice lives; the review queue sends missed items back here with `?id=`. */
export const PRACTICE_PATHS: Record<PracticeKind, string> = {
	mate1: '/practice/mate-in-one',
	mate3: '/practice/mate-in-three',
	tactics: '/practice/tactics',
	endgame: '/practice/endgames',
	goodMoves: '/practice/good-moves',
	lookAhead: '/practice/look-ahead',
	threat: '/practice/threats',
	eval: '/practice/who-is-better',
	feature: '/practice/spot-the-feature',
	safe: '/practice/is-it-safe',
	visual: '/practice/see-it',
	opening: '/practice/opening-moves',
	sacrifice: '/practice/sound-sacrifice',
	basics: '/practice/chess-basics',
	own: '/practice/review',
};

export const PRACTICE_TITLES: Record<PracticeKind, string> = {
	mate1: 'Mate in 1',
	mate3: 'Mate in 3',
	tactics: 'Tactics',
	endgame: 'Endgame technique',
	goodMoves: 'Good moves',
	lookAhead: 'Look Ahead',
	threat: 'What’s the threat?',
	eval: 'Who is better?',
	feature: 'Spot the feature',
	safe: 'Is it safe?',
	visual: 'See it in your head',
	opening: 'Opening moves',
	sacrifice: 'Sound sacrifice?',
	basics: 'Chess basics',
	own: 'Your mistakes',
};

/** Days until a missed item comes back, then again after each good answer; solved after the last. */
export const REVIEW_DAYS = [1, 3, 7];
