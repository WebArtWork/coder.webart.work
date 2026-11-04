import { describe, expect, it } from 'vitest';
import { difficultyOf } from '../src/config.ts';
import { replay } from '../src/chess/replay.ts';
import { analysePosition, type PositionInput } from '../src/analysis/position.ts';
import { pickSignalPlies, prescore, winChance } from '../src/analysis/signals.ts';
import type { EngineLine } from '../src/engine/uci.ts';
import { OPERA_GAME } from './helpers.ts';

const line = (cp: number, pv: string, mate: number | null = null): EngineLine => ({ cp, mate, depth: 18, pv: pv.split(' ') });

function position(fen: string, lines: EngineLine[], extra: Partial<PositionInput> = {}) {
	return analysePosition({
		ply: 30,
		fen,
		lines,
		playedLine: null,
		playedUci: null,
		lastCaptureSquare: null,
		depth: 18,
		pvPlies: 12,
		...extra,
	});
}

describe('quality scoring', () => {
	it('scores a game with sacrifices and a mating attack above a dull repetition draw', () => {
		const opera = prescore(replay(OPERA_GAME), null, '1-0');
		const shuffle = 'e4 e5 Nf3 Nc6 Ng1 Nb8 Nf3 Nc6 Ng1 Nb8 Nf3 Nc6 Ng1 Nb8'.split(' ');
		const dull = prescore(replay(shuffle), null, '1/2-1/2');
		expect(opera.score).toBeGreaterThan(dull.score + 20);
		expect(opera.signals.map((signal) => signal.kind)).toEqual(expect.arrayContaining(['sacrifice', 'mate']));
	});

	it('turns Lichess evals into mistake and punishment signals after the opening', () => {
		const san = 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#'.split(' ');
		const evals = [20, 30, 25, 30, 20, 60, -100, -90, -150, -150, -900, -9990, -9995, -10000];
		const score = prescore(replay(san), evals, '0-1');
		const kinds = new Map(score.signals.map((signal) => [signal.ply, signal.kind]));
		expect(kinds.get(10)).toBe('mistake'); // Rf1?? drops from -1.5 to -9
		expect(kinds.get(11)).toBe('punish'); // Black to find the refutation
		expect(score.signals.every((signal) => signal.ply >= 10)).toBe(true); // Nxe5 at ply 6 is opening
		expect(score.decidedAt).toBe(10);
	});

	it('picks spaced, strongest signal plies', () => {
		const signals = [
			{ ply: 20, kind: 'mistake' as const, weight: 3 },
			{ ply: 21, kind: 'punish' as const, weight: 2.9 },
			{ ply: 30, kind: 'tactic' as const, weight: 1 },
			{ ply: 40, kind: 'quiet' as const, weight: 0.5 },
		];
		expect(pickSignalPlies(signals, 2)).toEqual([20, 40]); // one slot kept for the quiet moment
		expect(pickSignalPlies(signals, 3)).toEqual([20, 30, 40]);
	});

	it('recognises a knight fork as a tactic with a clear best move', () => {
		const result = position('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', [
			line(480, 'd5c7 e8d7 c7a8'),
			line(-480, 'e1d2 a8a2'),
			line(-490, 'd5e3 a8a2'),
		]);
		expect(result.rejected).toBeNull();
		expect(result.motifs).toContain('fork');
		expect(result.categories).toContain('tactics');
		expect(result.quality).toBeGreaterThanOrEqual(50);
	});

	it('rejects positions without a decision', () => {
		const forced = position('7k/8/8/8/8/8/6q1/7K w - - 0 1', [line(-9999, 'h1g2', -1)]);
		expect(forced.rejected).toBe('forced');
		const winning = position('4k3/8/8/8/8/8/8/QQQ1K3 w - - 0 1', [
			line(2000, 'a1a8 e8e7'),
			line(1990, 'b1b8 e8e7'),
			line(1980, 'c1c8 e8e7'),
		]);
		expect(winning.rejected).toBe('already winning');
	});

	it('rejects a plain recapture', () => {
		const result = position(
			'4k3/8/8/8/3p4/8/8/3QK3 w - - 0 1',
			[line(900, 'd1d4 e8f7 d4d5'), line(100, 'd1d2 d4d3')],
			{ lastCaptureSquare: 'd4' },
		);
		expect(result.rejected).toBe('plain recapture');
	});

	it('marks the played mistake as a critical decision', () => {
		const result = position(
			'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
			[line(-20, 'g8f6 d2d3'), line(-30, 'f8c5 c2c3'), line(-35, 'f8e7 d2d4')],
			{ playedUci: 'd8h4', playedLine: line(-450, 'd8h4 f3h4') },
		);
		expect(result.played?.lossW).toBeGreaterThan(15);
		expect(result.categories).toContain('criticalDecision');
	});

	it('uses Lichess win-chance scaling', () => {
		expect(winChance(0)).toBeCloseTo(50);
		expect(winChance(300)).toBeGreaterThan(70);
		expect(winChance(-10000)).toBeLessThan(1);
	});
});

describe('difficulty classification', () => {
	it('maps ratings to training levels', () => {
		expect(difficultyOf(500)).toBe('beginner');
		expect(difficultyOf(999)).toBe('beginner');
		expect(difficultyOf(1000)).toBe('intermediate');
		expect(difficultyOf(1399)).toBe('intermediate');
		expect(difficultyOf(1400)).toBe('advanced');
		expect(difficultyOf(1800)).toBe('expert');
	});

	it('rates a free piece below a quiet, deeper combination', () => {
		const hanging = position('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', [
			line(850, 'd1d5 e8e7'),
			line(-850, 'e1e2 d5d1'),
			line(-860, 'e1f2 d5d1'),
		]);
		// quiet rook lift, then a mating net four plies later
		const quiet = position('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', [
			line(9995, 'd1d8', 1),
			line(30, 'g1f1 g8f8'),
			line(20, 'h2h3 h7h6'),
		]);
		const deep = position('r5k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1', [
			line(600, 'd2d8 a8d8 d1d8'),
			line(20, 'h2h3 h7h6'),
			line(10, 'g2g3 g7g6'),
		]);
		expect(hanging.difficulty).toBe('beginner');
		expect(quiet.difficultyRating).toBeLessThan(deep.difficultyRating);
		expect(hanging.difficultyRating).toBeLessThan(deep.difficultyRating);
	});
});
