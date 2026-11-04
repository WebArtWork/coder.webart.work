/**
 * The practices' files, served at /game/ (built by tools/chess-import, see its output/practices.ts):
 * threats.json, eval.json, features.json, safe.json, visualize.json, openings.json, sacrifices.json.
 * Every item carries what it needs; no game file is fetched. Scores are from White's point of view.
 */

import { Side } from '../chess/chess.interface';

/** What every practice item has; `game` and `ply` open "See the game". */
export interface PracticeItem {
	id: string;
	game: string;
	ply: number;
	fen: string;
	/** Side to move, or the side the board is shown from. */
	side: Side;
	rating: number;
	/** Opening family. */
	opening: string;
}

/** A move with its evaluation; `loss` is centipawns below the best, from the moving side. */
export interface ScoredMove {
	uci: string;
	san: string;
	cp: number | null;
	mate: number | null;
	loss: number;
}

export interface ThreatItem extends PracticeItem {
	/** The opponent's threat, UCI from the position with the side to move passed. */
	threat: string;
	/** Every opponent move that counts as finding the threat. */
	threats: string[];
	line: string[];
	/** Moves that deal with it. */
	answers: string[];
	/** The best move's evaluation; moves outside `answers` are checked against it. */
	cp: number | null;
	mate: number | null;
}

export type Imbalance = 'material' | 'bishopPair' | 'passedPawn' | 'pawnWeaknesses' | 'development' | 'space';

export interface EvalItem extends PracticeItem {
	band: 'white' | 'equal' | 'black';
	cp: number;
	/** The main imbalance first. */
	imbalances: { kind: Imbalance; side: Side; amount: number }[];
}

export type FeatureKind = 'isolated' | 'doubled' | 'backward' | 'passed' | 'outposts' | 'openFiles' | 'halfOpen';

export interface FeatureItem extends PracticeItem {
	feature: FeatureKind;
	/** Whose pawns, outposts or files; null for open files. */
	color: Side | null;
	/** Squares to tap; files (a–h) for open and half-open files. */
	answers: string[];
}

export interface SafeItem extends PracticeItem {
	move: string;
	san: string;
	safe: boolean;
	/** Unsafe moves: the refutation, the opponent's reply first. */
	refutation: string[];
	cp: number | null;
	mate: number | null;
	loss: number;
	played: boolean;
}

export type VisualQuestion =
	| { kind: 'piece'; square: string; answer: string; options: string[] }
	| { kind: 'attacked'; square: string; by: Side; answer: boolean }
	| { kind: 'moves'; square: string; piece: string; answer: string[] };

export interface VisualItem extends PracticeItem {
	moves: string[];
	sans: string[];
	question: VisualQuestion;
}

export interface OpeningItem extends PracticeItem {
	played: ScoredMove;
	answers: string[];
	lines: ScoredMove[];
	principles: string[];
	players: number;
}

export interface SacrificeItem extends PracticeItem {
	move: string;
	san: string;
	verdict: 'sound' | 'unsound' | 'unclear';
	material: number;
	cp: number | null;
	mate: number | null;
	loss: number;
	best: { uci: string; san: string; cp: number | null; mate: number | null };
	replies: ScoredMove[];
	answers: string[];
}

/** Every practice that records results, for the review queue and progress keys. */
export type PracticeKind =
	| 'mate1'
	| 'mate3'
	| 'tactics'
	| 'endgame'
	| 'goodMoves'
	| 'lookAhead'
	| 'threat'
	| 'eval'
	| 'feature'
	| 'safe'
	| 'visual'
	| 'opening'
	| 'sacrifice'
	| 'basics'
	| 'own';

/** The data file of each practice that has one. */
export const PRACTICE_FILES = {
	threat: 'threats.json',
	eval: 'eval.json',
	feature: 'features.json',
	safe: 'safe.json',
	visual: 'visualize.json',
	opening: 'openings.json',
	sacrifice: 'sacrifices.json',
} as const;

export type FileKind = keyof typeof PRACTICE_FILES;

export interface PracticeItems {
	threat: ThreatItem;
	eval: EvalItem;
	feature: FeatureItem;
	safe: SafeItem;
	visual: VisualItem;
	opening: OpeningItem;
	sacrifice: SacrificeItem;
}
