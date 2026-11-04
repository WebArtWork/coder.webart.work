import { PracticeKind } from './practice.interface';

/** Where each practice lives; the review queue sends missed items back here with `?id=`. */
export const PRACTICE_PATHS: Record<PracticeKind, string> = {
	mate1: '/practices/mate-in-one',
	mate3: '/practices/mate-in-three',
	tactics: '/practices/tactics',
	endgame: '/practices/endgames',
	goodMoves: '/practices/good-moves',
	lookAhead: '/practices/look-ahead',
	threat: '/practices/threats',
	eval: '/practices/who-is-better',
	feature: '/practices/spot-the-feature',
	safe: '/practices/is-it-safe',
	visual: '/practices/see-it',
	opening: '/practices/opening-moves',
	sacrifice: '/practices/sound-sacrifice',
	basics: '/practices/chess-basics',
	own: '/practices/review',
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
