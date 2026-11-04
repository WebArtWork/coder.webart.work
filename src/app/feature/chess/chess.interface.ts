export interface PVLine {
	moves: string[];
	sans: string[];
}

export interface MoveCategory {
	label: string;
	icon: string;
	color: string;
}

export interface TopMove {
	move: string;
	san: string;
	rawEval: number;
	diffBest: number;
	diffPos: number;
	category: MoveCategory | null;
	line: PVLine;
}

export interface EvaluatedMove {
	move: string;
	san: string;
	eval: number;
	rank: number | null;
	category: MoveCategory | null;
	diffBest: number;
	diffPos: number;
	line: PVLine;
}

export type CandidateStatus = 'pending' | 'hit' | 'miss' | 'hidden_gem';

export interface Candidate {
	move: string;
	san: string;
	status: CandidateStatus;
	eval?: number;
	diffBest?: number;
	diffPos?: number;
	category?: MoveCategory | null;
	line?: PVLine;
}

export type Side = 'white' | 'black';

export interface AnalysisSettings {
	depth: number;
	useMovetime: boolean;
	movetime: number;
	topMoves: number;
	minCandidates: number;
}

export interface DailyRecord {
	date: string;
	/** Puzzle id (`<gameId>-<ply>`); older records hold an id from the retired positions set. */
	id: string;
	/** Exercise type; missing on records from before puzzles had types (they were all 'candidates'). */
	mode?: 'best' | 'candidates' | 'line';
	hits: number;
	target: number;
	won: boolean;
	squares: string[];
	candidates: Candidate[];
	answers: TopMove[];
}

/** A game saved to the signed-in user's library (`users/{uid}/games/{id}`). */
export interface SavedGame {
	id: string;
	title: string;
	/** Position the moves start from. */
	startFen: string;
	/** Moves in SAN, from `startFen`. Empty for a position without moves. */
	sans: string[];
	/** Position after the last move. */
	fen: string;
	createdAt: Date | null;
}

export type NewSavedGame = Omit<SavedGame, 'id' | 'createdAt'>;
