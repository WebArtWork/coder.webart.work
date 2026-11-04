import { Chess, type Color } from 'chess.js';
import { CATEGORIES, difficultyOf, type Category, type Difficulty } from '../config.ts';
import { ENDGAME_PHASE, kingZonePressure, phase, piecesOf } from '../chess/board.ts';
import { walkPv, type PvWalk } from '../chess/motifs.ts';
import { positionalThemes } from '../chess/structure.ts';
import type { EngineLine } from '../engine/uci.ts';
import { winChance } from './signals.ts';

export interface AnalysedLine {
	uci: string[];
	san: string[];
	/** Side to move's point of view. */
	cp: number;
	mate: number | null;
}

export interface PlayedMove {
	uci: string;
	san: string;
	cp: number;
	mate: number | null;
	/** Win-chance points lost against the best move. */
	lossW: number;
	/** The engine line starting with the played move: shows the refutation of a mistake. */
	line: AnalysedLine | null;
}

export interface PositionAnalysis {
	ply: number;
	fen: string;
	sideToMove: Color;
	legalMoves: number;
	depth: number;
	lines: AnalysedLine[];
	played: PlayedMove | null;
	/** Win-chance points between the best and second-best move. */
	gapW: number;
	/** Moves within half a pawn of the best. */
	nearBest: number;
	/** A capture or check that looks good but loses: the second-best line, or the game move. */
	tempting: boolean;
	calcDepth: number;
	motifs: string[];
	categories: Category[];
	category: Category;
	difficultyRating: number;
	difficulty: Difficulty;
	quality: number;
	/** Why the position is not worth training on, or null. */
	rejected: string | null;
}

export interface PositionInput {
	ply: number;
	fen: string;
	lines: EngineLine[];
	/** Engine line for the move actually played (when it is not among `lines`). */
	playedLine: EngineLine | null;
	playedUci: string | null;
	/** Square the previous move captured on, to spot plain recaptures. */
	lastCaptureSquare: string | null;
	depth: number;
	pvPlies: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const TACTICAL_MOTIFS = new Set([
	'fork',
	'pin',
	'skewer',
	'discoveredCheck',
	'doubleCheck',
	'sacrifice',
	'mate',
	'backRankMate',
	'promotion',
	'underPromotion',
	'quietMove',
]);

export function analysePosition(input: PositionInput): PositionAnalysis {
	const chess = new Chess(input.fen);
	const side = chess.turn();
	const legalMoves = chess.moves().length;
	const pieces = piecesOf(chess);
	const material = phase(pieces);

	const walks = input.lines.map((line) => walkPv(input.fen, line.pv, input.pvPlies, line.cp));
	const lines: AnalysedLine[] = input.lines.map((line, i) => ({
		uci: walks[i].uci,
		san: walks[i].san,
		cp: line.cp,
		mate: line.mate,
	}));
	const best = input.lines[0];
	const bestWalk = walks[0];
	const second = input.lines[1];
	const wBest = winChance(best.cp);
	const gapW = second ? wBest - winChance(second.cp) : 50;
	const nearBest = input.lines.filter((line) => best.cp - line.cp <= 50).length;

	let played: PlayedMove | null = null;
	if (input.playedUci) {
		const index = input.lines.findIndex((line) => line.pv[0] === input.playedUci);
		const source = index >= 0 ? input.lines[index] : input.playedLine;
		if (source) {
			const walk = index >= 0 ? walks[index] : walkPv(input.fen, source.pv, input.pvPlies, source.cp);
			played = {
				uci: input.playedUci,
				san: walk.san[0] ?? input.playedUci,
				cp: source.cp,
				mate: source.mate,
				lossW: Math.max(0, wBest - winChance(source.cp)),
				line: { uci: walk.uci, san: walk.san, cp: source.cp, mate: source.mate },
			};
		}
	}

	const rejected = rejection(input, legalMoves, best, second, bestWalk, gapW);
	const motifs = [...bestWalk.motifs];
	if (best.mate !== null && best.mate > 0) motifs.push(`mateIn${Math.min(best.mate, 9)}`);
	if (isPerpetual(bestWalk, best.cp, gapW)) motifs.push('perpetualCheck');

	const pressure = kingZonePressure(chess, pieces, side);
	// what the best move does with the structure: the positional category needs one of these
	const structural = best.pv.length ? positionalThemes(input.fen, best.pv[0]) : [];
	const scores = categoryScores({
		best,
		bestWalk,
		gapW,
		wBest,
		nearBest,
		lossW: played?.lossW ?? 0,
		endgame: material <= ENDGAME_PHASE,
		pressure,
		motifs,
		structural,
	});
	const categories = CATEGORIES.filter((category) => scores[category] > 0).sort((a, b) => scores[b] - scores[a]);
	if (categories.includes('positional')) motifs.push(...structural);
	const category: Category = categories[0] ?? 'positional';
	const reason = rejected ?? (categories.length ? null : 'no clear theme');
	if (!categories.length) categories.push(category);

	const secondWalk = walks[1];
	const temptingSecond =
		Boolean(secondWalk) && (secondWalk.firstCapture || secondWalk.firstCheck) && gapW >= 15;
	const difficultyRating = rateDifficulty({
		category,
		categories,
		walk: bestWalk,
		motifs,
		nearBest,
		temptingSecond,
		best,
		played,
		bestUci: best.pv[0],
	});

	return {
		ply: input.ply,
		fen: input.fen,
		sideToMove: side,
		legalMoves,
		depth: input.depth,
		lines,
		played,
		gapW: round1(gapW),
		nearBest,
		tempting: temptingSecond || Boolean(played && played.lossW >= 15 && /[x+]/.test(played.san)),
		calcDepth: bestWalk.calcDepth,
		motifs,
		categories,
		category,
		difficultyRating,
		difficulty: difficultyOf(difficultyRating),
		quality: reason ? 0 : rateQuality({ gapW, wBest, nearBest, lines: input.lines, motifs, walk: bestWalk, played, category }),
		rejected: reason,
	};
}

function rejection(
	input: PositionInput,
	legalMoves: number,
	best: EngineLine,
	second: EngineLine | undefined,
	walk: PvWalk,
	gapW: number,
): string | null {
	if (legalMoves <= 2) return 'forced';
	if (!best.pv.length) return 'no line';
	const wBest = winChance(best.cp);
	if (wBest <= 8) return 'lost anyway';
	if (second && winChance(second.cp) >= 85 && !(best.mate !== null && best.mate > 0 && second.mate === null)) {
		return 'already winning';
	}
	if (input.lastCaptureSquare && best.pv[0].slice(2, 4) === input.lastCaptureSquare && walk.firstCapture && gapW >= 20) {
		const regained = walk.material[0] ?? 0;
		if (regained >= 1 && (walk.material.at(-1) ?? 0) <= regained) return 'plain recapture';
	}
	return null;
}

interface CategoryInput {
	best: EngineLine;
	bestWalk: PvWalk;
	gapW: number;
	wBest: number;
	nearBest: number;
	lossW: number;
	endgame: boolean;
	pressure: number;
	motifs: string[];
	/** Outpost, open file, weak pawn, passed pawn or pawn break: what the best move does with the structure. */
	structural: string[];
}

/** A score per category; zero means the category does not apply. */
function categoryScores(input: CategoryInput): Record<Category, number> {
	const { best, bestWalk: walk, gapW, wBest, nearBest, lossW, endgame, pressure, motifs, structural } = input;
	const mating = best.mate !== null && best.mate > 0;
	const tactical = motifs.some((motif) => TACTICAL_MOTIFS.has(motif));
	const forcing = walk.firstCapture || walk.firstCheck;
	const scores = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<Category, number>;

	if (gapW >= 15 && (mating || walk.gain >= 2 || tactical)) scores.tactics = 2 + gapW / 10 + (mating ? 1 : 0);
	if (gapW >= 12 && walk.calcDepth >= 5) scores.calculation = walk.calcDepth / 2;
	if (nearBest >= 3 && Math.abs(best.cp) <= 200) scores.candidateMoves = nearBest;
	if (!forcing && !tactical && !endgame && structural.length && gapW >= 6 && gapW < 30 && Math.abs(best.cp) <= 300) {
		scores.positional = 1.2 + gapW / 15;
	}
	if (wBest >= 55 && (walk.checks >= 2 || pressure >= 5 || mating)) scores.attack = 1 + pressure / 3 + walk.checks / 2;
	if (wBest <= 60 && gapW >= 15) scores.defense = 1 + gapW / 10;
	if (motifs.includes('perpetualCheck')) scores.defense = Math.max(scores.defense, 3);
	if (endgame) scores.endgame = 1.5 + (gapW >= 10 ? 1 : 0);
	if (lossW >= 15 || (gapW >= 25 && wBest >= 30 && wBest <= 80)) scores.criticalDecision = 1 + Math.max(lossW, gapW) / 12;
	return scores;
}

interface DifficultyInput {
	category: Category;
	categories: Category[];
	walk: PvWalk;
	motifs: string[];
	nearBest: number;
	temptingSecond: boolean;
	best: EngineLine;
	played: PlayedMove | null;
	bestUci: string;
}

/** Estimated training rating: how deep, how quiet, how misleading the position is. */
function rateDifficulty(input: DifficultyInput): number {
	const { category, categories, walk, motifs, played } = input;
	let rating = 800;
	rating += 90 * Math.max(0, Math.min(7, walk.calcDepth) - 1);
	if (motifs.includes('quietMove') || (walk.firstQuiet && categories.includes('tactics'))) rating += 220;
	if (motifs.includes('sacrifice')) rating += 150;
	if (motifs.includes('underPromotion')) rating += 150;
	if (input.nearBest >= 3) rating += 120;
	if (input.temptingSecond) rating += 120;
	if (motifs.includes('hangingPiece')) rating -= 200;
	if (input.best.mate === 1) rating -= 150;
	if (category === 'positional') rating += 650;
	else if (category === 'endgame') rating += 350;
	else if (category === 'candidateMoves') rating += 350;
	if (categories.includes('defense')) rating += 150;
	if (category === 'criticalDecision' && !categories.includes('tactics')) rating += 100;
	if (played) {
		if (played.uci === input.bestUci) rating -= 60;
		else if (played.lossW >= 20) rating += 60;
	}
	return Math.round(Math.max(500, Math.min(2400, rating)));
}

interface QualityInput {
	gapW: number;
	wBest: number;
	nearBest: number;
	lines: EngineLine[];
	motifs: string[];
	walk: PvWalk;
	played: PlayedMove | null;
	category: Category;
}

/** 0–100: a clear answer, an instructive idea, a real decision in the game, a position still in play. */
function rateQuality(input: QualityInput): number {
	const { gapW, wBest, walk, played, motifs } = input;
	const depthScore = walk.calcDepth >= 3 && walk.calcDepth <= 9 ? 1 : walk.calcDepth === 2 ? 0.5 : 0.25;
	const balance = wBest >= 25 && wBest <= 85 ? 1 : 0.4;
	const motifScore = clamp01(motifs.filter((motif) => TACTICAL_MOTIFS.has(motif)).length / 2);
	const mistake = clamp01((played?.lossW ?? 0) / 30);

	const sharp = 35 * clamp01((gapW - 5) / 30) + 15 * motifScore + 15 * depthScore + 15 * mistake + 10 * balance;

	// candidate-move and positional positions: several playable moves and at least one clear error
	const worst = input.lines.at(-1);
	const spreadW = worst ? wBest - winChance(worst.cp) : 0;
	const rich =
		clamp01(spreadW / 10) *
		(30 * clamp01((input.nearBest - 1) / 3) +
			25 * clamp01(spreadW / 25) +
			15 * mistake +
			15 * balance +
			(input.category === 'positional' || input.category === 'candidateMoves' ? 10 : 0));

	return Math.round(Math.max(sharp, rich));
}

function isPerpetual(walk: PvWalk, cp: number, gapW: number): boolean {
	if (Math.abs(cp) > 30 || gapW < 15) return false;
	const own = walk.san.filter((_, i) => i % 2 === 0);
	return own.length >= 3 && own.every((san) => san.includes('+'));
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Score from White's point of view for output; mates stay as a separate field. */
export function whiteCp(cp: number, mate: number | null, side: Color): { cp: number | null; mate: number | null } {
	const sign = side === 'w' ? 1 : -1;
	if (mate !== null) return { cp: null, mate: sign * mate };
	return { cp: sign * cp, mate: null };
}

/** Centipawns the side to move gives up compared with the best line (mates capped at 10 pawns). */
export function cpLoss(bestCp: number, cp: number): number {
	const cap = (value: number) => Math.max(-1000, Math.min(1000, value));
	return Math.max(0, Math.round(cap(bestCp) - cap(cp)));
}

