import path from 'node:path';
import { fromRoot, toolDir } from './paths.ts';

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const CATEGORIES = [
	'tactics',
	'calculation',
	'candidateMoves',
	'positional',
	'attack',
	'defense',
	'endgame',
	'criticalDecision',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * What a game's training positions feed besides the puzzles: tactics, good-moves positions, quiet
 * positions (Who is better?), endgames, sacrifices, tempting captures and checks (Is it safe?).
 */
export const PRACTICE_TAGS = ['tactics', 'candidates', 'quiet', 'endgame', 'sacrifice', 'tempting'] as const;
export type PracticeTag = (typeof PRACTICE_TAGS)[number];

export const SPEEDS = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;
export type Speed = (typeof SPEEDS)[number];

export const STAGES = ['scan', 'quick', 'deep', 'select', 'export'] as const;
export type Stage = (typeof STAGES)[number];

/** Estimated training level, not an official rating: 500–1000, 1000–1400, 1400–1800, 1800+. */
export function difficultyOf(rating: number): Difficulty {
	if (rating < 1000) return 'beginner';
	if (rating < 1400) return 'intermediate';
	if (rating < 1800) return 'advanced';
	return 'expert';
}

export interface Config {
	/** Archive to read; empty = the first Lichess archive not fully imported yet. */
	input: string;
	/** games.json, the full dataset. The app gets its own slim copy in `appDir`. */
	output: string;
	/** SQLite state, engine cache and checkpoints. */
	workDir: string;
	/** Stockfish binary (or the npm .js build); empty = auto-detect. */
	engine: string;
	/** Every game ever imported and where the archive was left, per output file. */
	history: string;
	/** Discard an unfinished batch instead of continuing it. */
	fresh: boolean;
	/** Stop after this stage (empty = run everything). */
	until: Stage | '';

	// Scan: cheap filters before any engine work
	/** Archive games read per batch. */
	maxScan: number;
	minRating: number;
	maxRating: number;
	maxRatingGap: number;
	speeds: Speed[];
	terminations: string[];
	allowBots: boolean;
	minPlies: number;
	maxPlies: number;
	/** Heuristic score (0–100) a game needs to be kept as a candidate. */
	minPrescore: number;
	/** Candidates kept on disk, lowest prescore dropped first; 0 = 2 × quickPool. */
	maxCandidates: number;

	// Engine
	workers: number;
	hash: number;
	quickDepth: number;
	quickMultiPv: number;
	quickPositions: number;
	/** Games given the quick engine pass; 0 = 6 × maxExport. */
	quickPool: number;
	depth: number;
	multiPv: number;
	/** Games given the deep engine pass; 0 = 1.6 × maxExport. */
	deepPool: number;
	/** Plies kept per principal variation. */
	pvPlies: number;

	// Selection
	maxExport: number;
	positionsPerGame: number;
	minPositions: number;
	/** Quality (0–100) a single position needs to be used for training. */
	minPositionQuality: number;
	minQuality: number;
	minUniqueness: number;
	/** Wanted share of each training level; a soft weight in the selection, not a quota. */
	difficultyMix: Record<Difficulty, number>;
	/** Wanted share of games feeding each practice, so a batch is not mostly tactics. */
	practiceMix: Record<PracticeTag, number>;

	// Output
	/** The app's copy: catalog.json, daily.json and g/<id>.json, served at /game/. Empty = skip. */
	appDir: string;
}

export function defaultConfig(): Config {
	return {
		input: '',
		output: fromRoot('src/data/game/games.json'),
		workDir: path.join(toolDir, '.work'),
		engine: '',
		history: path.join(toolDir, 'import-history.json'),
		fresh: false,
		until: '',

		maxScan: 100_000,
		minRating: 1200,
		maxRating: 2400,
		maxRatingGap: 300,
		speeds: ['rapid', 'classical'],
		terminations: ['Normal'],
		allowBots: false,
		minPlies: 40,
		maxPlies: 300,
		minPrescore: 25,
		maxCandidates: 0,

		workers: 3,
		hash: 64,
		quickDepth: 10,
		quickMultiPv: 3,
		quickPositions: 8,
		quickPool: 0,
		depth: 18,
		multiPv: 5,
		deepPool: 0,
		pvPlies: 12,

		maxExport: 1000,
		positionsPerGame: 5,
		minPositions: 2,
		minPositionQuality: 35,
		minQuality: 45,
		minUniqueness: 30,
		// the difficulty estimate rarely reaches 1400, so most games are beginner or intermediate; a mix asking
		// for a third advanced games could never be met (see README, Scores)
		difficultyMix: { beginner: 0.3, intermediate: 0.5, advanced: 0.15, expert: 0.05 },
		practiceMix: { tactics: 0.3, candidates: 0.2, quiet: 0.2, endgame: 0.15, sacrifice: 0.05, tempting: 0.1 },

		appDir: fromRoot('src/data/game/app'),
	};
}

export function quickPoolSize(config: Config): number {
	return config.quickPool || config.maxExport * 6;
}

export function deepPoolSize(config: Config): number {
	return config.deepPool || Math.ceil(config.maxExport * 1.6);
}

export function maxCandidates(config: Config): number {
	return config.maxCandidates || quickPoolSize(config) * 2;
}
