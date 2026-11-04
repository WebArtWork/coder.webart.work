import { describe, expect, it } from 'vitest';
import { exercise, mateInOne, mateInThree, planDaily, type CatalogPuzzle } from '../src/output/app.ts';
import { replay } from '../src/chess/replay.ts';
import { OPERA_GAME } from './helpers.ts';
import type { GameRecord } from '../src/output/record.ts';
import type { TrainingPosition } from '../src/output/record.ts';

function position(change: Partial<TrainingPosition>, losses: number[] = [0, 200], pv = 'e2e4 e7e5 g1f3 b8c6 f1b5'): TrainingPosition {
	return {
		ply: 20,
		moveNumber: 11,
		sideToMove: 'white',
		fen: '',
		category: 'tactics',
		categories: ['tactics'],
		themes: [],
		difficulty: 'intermediate',
		difficultyRating: 1200,
		qualityScore: 60,
		bestMove: { san: 'e4', uci: 'e2e4' },
		bestReply: null,
		playedMove: { rank: 0, san: '', uci: 'd2d4', cp: 0, mate: null, loss: 0, isBest: false, refutation: null },
		candidateMoves: losses.map((loss, i) => ({ rank: i + 1, san: '', uci: 'e2e4', cp: 0, mate: null, loss })),
		principalVariations: losses.map((_, i) => ({ rank: i + 1, cp: 0, mate: null, san: [], uci: pv.split(' ') })),
		calculationDepth: 1,
		engineDepth: 18,
		...change,
	};
}

describe('exercise per position', () => {
	it('asks for the best move by default', () => {
		expect(exercise(position({}))).toEqual({ mode: 'best', target: 1, solution: [] });
	});

	it('asks for the good moves whenever three or more moves are good', () => {
		const result = exercise(position({ category: 'candidateMoves', categories: ['candidateMoves'] }, [0, 20, 45, 120]));
		expect(result).toMatchObject({ mode: 'candidates', target: 3 });
		expect(exercise(position({ category: 'tactics' }, [0, 10, 30, 40, 300])).mode).toBe('candidates');
		// one or two good moves make a best-move puzzle
		expect(exercise(position({ category: 'positional' }, [0, 20, 90])).mode).toBe('best');
	});

	it('asks to play the line in calculation positions, ending on your move', () => {
		const result = exercise(position({ calculationDepth: 3, categories: ['tactics', 'calculation'] }));
		expect(result).toEqual({ mode: 'line', target: 2, solution: ['e2e4', 'e7e5', 'g1f3'] });
		expect(exercise(position({ calculationDepth: 4 })).solution).toHaveLength(5);
	});
});

describe('daily schedule', () => {
	const puzzle = (id: string, rating: number) => ({ id, rating, mode: 'candidates' }) as CatalogPuzzle;
	const puzzles = [puzzle('a-1', 900), puzzle('b-1', 1450), puzzle('c-1', 1200), puzzle('d-1', 1050)];

	it('plans every day ahead with distinct puzzles first, easier on Mondays than Saturdays', () => {
		const schedule = planDaily({}, puzzles, '2026-10-12'); // a Monday
		expect(Object.keys(schedule).length).toBeGreaterThan(300);
		expect(new Set(Object.values(schedule).slice(0, 4)).size).toBe(4);
		expect(schedule['2026-10-12']).toBe('a-1');
	});

	it('keeps past days, and today onward while the puzzle still exists', () => {
		const previous = { '2026-10-01': 'gone-5', '2026-10-12': 'c-1', '2026-10-13': 'gone-6' };
		const schedule = planDaily(previous, puzzles, '2026-10-12');
		expect(schedule['2026-10-01']).toBe('gone-5');
		expect(schedule['2026-10-12']).toBe('c-1');
		expect(schedule['2026-10-13']).not.toBe('gone-6');
	});
});

describe('mate-in-1 practice set', () => {
	it('takes the position before a game-ending checkmate', () => {
		const plies = replay(OPERA_GAME).plies;
		const game = {
			id: 'opera123',
			opening: 'Philidor Defense',
			moves: OPERA_GAME,
			uciMoves: plies.map((ply) => ply.uci),
			trainingPositions: [],
		} as unknown as GameRecord;
		const [item] = mateInOne([game]);
		expect(item).toMatchObject({ id: `opera123-${OPERA_GAME.length - 1}`, side: 'white', move: 'd1d8', opening: 'Philidor Defense' });
		expect(item.fen).toBe(plies.at(-1)!.fen);
		expect(item.rating).toBeGreaterThanOrEqual(400);
		expect(item.rating).toBeLessThanOrEqual(1200);
	});
});

describe('mate-in-3 practice set', () => {
	const plies = replay(OPERA_GAME).plies;
	// Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#, and Rd1 Qe6 before it
	const gameWith = (start: number, mate: number, second: number | null = null) =>
		({
			id: 'opera123',
			opening: 'Philidor Defense',
			moves: OPERA_GAME,
			uciMoves: plies.map((ply) => ply.uci),
			trainingPositions: [
				position({
					ply: start,
					fen: plies[start].fen,
					principalVariations: [
						{ rank: 1, cp: null, mate, san: [], uci: plies.slice(start).map((ply) => ply.uci) },
						{ rank: 2, cp: null, mate: second, san: [], uci: [] },
					],
				}),
			],
		}) as unknown as GameRecord;
	const mateStart = OPERA_GAME.length - 5;

	it('takes training positions whose best line mates in three', () => {
		const [item] = mateInThree([gameWith(mateStart, 3)]);
		expect(item).toMatchObject({ id: `opera123-${mateStart}`, ply: mateStart, side: 'white', move: 'b5d7' });
		expect(item.line).toHaveLength(5);
		expect(item.line!.at(-1)).toBe('d1d8');
		expect(item.rating).toBeGreaterThanOrEqual(1000);
		expect(item.rating).toBeLessThanOrEqual(1900);
	});

	it('takes the last three moves of a longer mate, linked to the game position', () => {
		const [item] = mateInThree([gameWith(mateStart - 2, 4)]);
		expect(item).toMatchObject({ id: `opera123-${mateStart}`, ply: mateStart - 2, move: 'b5d7' });
		expect(item.fen).toBe(plies[mateStart].fen);
	});

	it('skips positions where another move mates as fast', () => {
		expect(mateInThree([gameWith(mateStart, 3, 3)])).toEqual([]);
		expect(mateInThree([gameWith(mateStart, 3, 4)])).toHaveLength(1);
	});
});
