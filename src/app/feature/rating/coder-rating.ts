import { TOTAL_POINTS } from '../practice/practice.data';
import { PracticeScores, scoreTotal } from '../practice/practice-score';

/** Where every developer starts, before any lesson is practiced. */
export const CODER_BASE_RATING = 800;
/** Rating a perfect lesson result adds; all 103 lessons at full marks come to about 2600. */
export const RATING_PER_LESSON = 17.5;
/** A lesson that was read but not practiced still counts a little. */
export const RATING_PER_READ = 2;

export interface CoderRank {
	name: string;
	/** Rating needed to reach it. */
	from: number;
}

/** The developer ladder, from the first lesson to the architect's chair. */
export const CODER_RANKS: CoderRank[] = [
	{ name: 'Trainee', from: 0 },
	{ name: 'Junior', from: 1000 },
	{ name: 'Middle', from: 1400 },
	{ name: 'Senior', from: 1800 },
	{ name: 'Lead', from: 2200 },
	{ name: 'Architect', from: 2500 },
];

export interface CoderRating {
	rating: number;
	rank: CoderRank;
	next: CoderRank | null;
	/** Share of the way from this rank to the next, 0 to 1; 1 at the top. */
	share: number;
}

/**
 * The Coder Elo: every practiced lesson adds the share of its points the reader earned, so it only grows
 * as results improve, and it is the same on every device because it is computed from the saved results.
 */
export function coderRating(scores: PracticeScores, readOnly: number): CoderRating {
	let rating = CODER_BASE_RATING + readOnly * RATING_PER_READ;
	for (const score of Object.values(scores)) {
		rating += Math.min(1, scoreTotal(score) / TOTAL_POINTS) * RATING_PER_LESSON;
	}
	rating = Math.round(rating);
	let index = 0;
	while (CODER_RANKS[index + 1] && rating >= CODER_RANKS[index + 1].from) index++;
	const rank = CODER_RANKS[index];
	const next = CODER_RANKS[index + 1] ?? null;
	return { rating, rank, next, share: next ? (rating - rank.from) / (next.from - rank.from) : 1 };
}
