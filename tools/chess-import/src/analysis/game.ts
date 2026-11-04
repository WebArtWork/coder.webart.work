import { Chess } from 'chess.js';
import { difficultyOf, type Category, type Difficulty, type PracticeTag } from '../config.ts';
import { fenKey } from '../chess/board.ts';
import { replay, type Ply } from '../chess/replay.ts';
import type { EnginePool } from '../engine/pool.ts';
import { similarityTokens } from '../similarity/features.ts';
import { analysePosition, type PositionAnalysis } from './position.ts';
import type { Signal } from './signals.ts';
import { pickSignalPlies } from './signals.ts';

/** What the scan stage stores per candidate game. */
export interface CandidateGame {
	id: string;
	headers: Record<string, string>;
	san: string[];
	uci: string[];
	prescore: number;
	signals: Signal[];
}

export interface GameAnalysis {
	quality: number;
	difficultyRating: number;
	difficulty: Difficulty;
	categories: Category[];
	themes: string[];
	/** Training positions, in game order. */
	positions: PositionAnalysis[];
	/** Every analysed position, including rejected ones (kept for the next pass and for debugging). */
	analysed: { ply: number; quality: number; category: Category; rejected: string | null }[];
	tokens: string[];
	fens: string[];
}

export interface PassOptions {
	depth: number;
	multiPv: number;
	pvPlies: number;
	positionsPerGame: number;
	minPositions: number;
	/** Quality (0–100) a position needs to become a training position. */
	minPositionQuality: number;
}

/** Engine pass over the chosen plies of one game. */
export async function analyseGame(
	game: CandidateGame,
	plies: number[],
	pool: EnginePool,
	options: PassOptions,
): Promise<GameAnalysis> {
	const moves = replay(game.san).plies;
	const results: PositionAnalysis[] = [];
	for (const ply of plies) {
		if (ply <= 0 || ply >= moves.length) continue;
		const position = await analysePly(moves, ply, pool, options);
		if (position) results.push(position);
	}
	return summarise(game, results, options);
}

async function analysePly(moves: Ply[], ply: number, pool: EnginePool, options: PassOptions) {
	const fen = moves[ply].fen;
	if (new Chess(fen).isGameOver()) return null;
	const playedUci = moves[ply].uci;
	const lines = await pool.analyse({ fen, depth: options.depth, multiPv: options.multiPv });
	if (!lines.length) return null;
	const playedLine = lines.some((line) => line.pv[0] === playedUci)
		? null
		: ((await pool.analyse({ fen, depth: options.depth, multiPv: 1, searchMoves: [playedUci] }))[0] ?? null);
	const previous = moves[ply - 1];
	return analysePosition({
		ply,
		fen,
		lines,
		playedLine,
		playedUci,
		lastCaptureSquare: previous.captured ? previous.to : null,
		depth: options.depth,
		pvPlies: options.pvPlies,
	});
}

/** Picks the training positions and scores the game. */
export function summarise(game: CandidateGame, results: PositionAnalysis[], options: PassOptions): GameAnalysis {
	const usable = results.filter((position) => !position.rejected && position.quality >= options.minPositionQuality);
	const positions = choosePositions(usable, options.positionsPerGame).sort((a, b) => a.ply - b.ply);
	const analysed = results.map((position) => ({
		ply: position.ply,
		quality: position.quality,
		category: position.category,
		rejected: position.rejected,
	}));

	const categoryCounts = new Map<Category, number>();
	for (const position of positions) {
		for (const category of position.categories) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
	}
	const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
	const themes = [...new Set(positions.flatMap((position) => position.motifs.filter((motif) => !motif.startsWith('mateIn'))))];

	let quality = 0;
	let difficultyRating = 0;
	if (positions.length >= options.minPositions) {
		const ranked = [...positions].sort((a, b) => b.quality - a.quality);
		const mean = ranked.reduce((sum, position) => sum + position.quality, 0) / ranked.length;
		const primaries = new Set(positions.map((position) => position.category)).size;
		const diversity = primaries / Math.min(4, positions.length);
		const coverage = positions.length / options.positionsPerGame;
		const manyGood = positions.some((position) => position.nearBest >= 3) ? 6 : 0;
		quality = Math.round(Math.min(100, 0.6 * mean + 15 * diversity + 0.15 * game.prescore + 10 * coverage + manyGood));
		const ratings = positions.map((position) => position.difficultyRating).sort((a, b) => a - b);
		difficultyRating = ratings[Math.floor((ratings.length - 1) / 2)];
	}

	return {
		quality,
		difficultyRating,
		difficulty: difficultyOf(difficultyRating || 500),
		categories,
		themes,
		positions,
		analysed,
		tokens: similarityTokens(game.headers, positions),
		fens: positions.map((position) => fenKey(position.fen)),
	};
}

/** Best positions first, with a bonus for categories not yet covered and at least three plies apart. */
function choosePositions(positions: PositionAnalysis[], count: number): PositionAnalysis[] {
	const remaining = [...positions];
	const chosen: PositionAnalysis[] = [];
	const covered = new Set<Category>();
	while (chosen.length < count && remaining.length) {
		let bestIndex = -1;
		let bestValue = -Infinity;
		remaining.forEach((position, i) => {
			if (chosen.some((other) => Math.abs(other.ply - position.ply) < 3)) return;
			// positions with several good moves feed the Play page, so they are kept when they qualify
			const value = position.quality + (covered.has(position.category) ? 0 : 8) + (position.nearBest >= 3 ? 12 : 0);
			if (value > bestValue) {
				bestValue = value;
				bestIndex = i;
			}
		});
		if (bestIndex < 0) break;
		const [position] = remaining.splice(bestIndex, 1);
		chosen.push(position);
		covered.add(position.category);
	}
	return chosen;
}

/** The practices a game's training positions feed, for the practice mix of the selection. */
export function practiceTags(positions: PositionAnalysis[]): PracticeTag[] {
	const tags = new Set<PracticeTag>();
	for (const position of positions) {
		if (position.categories.includes('tactics') || position.categories.includes('calculation')) tags.add('tactics');
		if (position.nearBest >= 3) tags.add('candidates');
		if (position.nearBest >= 2 && Math.abs(position.lines[0]?.cp ?? 0) <= 400) tags.add('quiet');
		if (position.categories.includes('endgame')) tags.add('endgame');
		if (position.motifs.includes('sacrifice')) tags.add('sacrifice');
		if (position.tempting) tags.add('tempting');
	}
	return [...tags];
}

/** Plies for the preliminary pass: the strongest heuristic signals. */
export function quickPlies(game: CandidateGame, count: number): number[] {
	return pickSignalPlies(game.signals, count);
}

/** Plies for the deep pass: the best positions of the preliminary pass plus one spare. */
export function deepPlies(quick: GameAnalysis, count: number): number[] {
	const chosen = new Set(quick.positions.map((position) => position.ply));
	const spare = quick.analysed
		.filter((position) => !chosen.has(position.ply) && !position.rejected)
		.sort((a, b) => b.quality - a.quality)
		.map((position) => position.ply);
	return [...chosen, ...spare].slice(0, count + 1).sort((a, b) => a - b);
}
