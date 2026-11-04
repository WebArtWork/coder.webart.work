/** Every new player starts here; the rating never drops below the floor. */
export const START_RATING = 1000;
export const MIN_RATING = 100;
/** Rated puzzles played with the faster K, while the rating finds its level. */
export const PROVISIONAL = 20;

/**
 * Pawns earned per completion. They reward doing the work, not the result's rating, and never
 * touch the rating. Mirrored by the cap in firestore.rules.
 */
export const PAWNS = {
	/** Puzzle practice, random and game puzzles: for trying, and more for solving. */
	puzzle: 1,
	puzzleSolved: 3,
	daily: 5,
	dailyWon: 10,
	/** Added on every 7th day in a row. */
	weekStreak: 20,
	lookAheadPath: 2,
	lookAheadMax: 20,
	/** Every puzzle of a game finished, on the game page. */
	game: 5,
} as const;
/** The most one completion can earn; firestore.rules allows no more. */
export const MAX_PAWNS = 40;

export interface Rank {
	name: string;
	/** Pawns needed to reach it. */
	from: number;
	/** Unicode piece, for badges. */
	symbol: string;
}

/** Collect pawns to promote, one piece at a time. */
export const RANKS: Rank[] = [
	{ name: 'Pawn', from: 0, symbol: '♟' },
	{ name: 'Knight', from: 100, symbol: '♞' },
	{ name: 'Bishop', from: 300, symbol: '♝' },
	{ name: 'Rook', from: 700, symbol: '♜' },
	{ name: 'Queen', from: 1500, symbol: '♛' },
	{ name: 'King', from: 3000, symbol: '♚' },
];

export interface RankProgress {
	rank: Rank;
	next: Rank | null;
	/** Pawns still needed for the next rank; 0 at the top. */
	toNext: number;
	/** Share of the way from this rank to the next, 0 to 1; 1 at the top. */
	share: number;
}

export function rankOf(pawns: number): RankProgress {
	let index = 0;
	while (RANKS[index + 1] && pawns >= RANKS[index + 1].from) index++;
	const rank = RANKS[index];
	const next = RANKS[index + 1] ?? null;
	if (!next) return { rank, next, toNext: 0, share: 1 };
	return { rank, next, toNext: next.from - pawns, share: (pawns - rank.from) / (next.from - rank.from) };
}

/**
 * Elo change for one rated puzzle: `score` is 1 for solved, 0 for failed, or the share found.
 * Never 0, so every attempt moves the rating. firestore.rules checks the same formula.
 */
export function ratingChange(player: number, rated: number, puzzle: number, score: number): number {
	const expected = 1 / (1 + 10 ** ((puzzle - player) / 400));
	const k = rated < PROVISIONAL ? 48 : 24;
	const delta = Math.round(k * (score - expected)) || (score >= 0.5 ? 1 : -1);
	return Math.max(MIN_RATING, player + delta) - player;
}
