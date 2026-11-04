import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { evalBandOf, fixPositional, passedFen, temptingOf } from '../src/analysis/enrich.ts';
import { boardFeatures, endgameGroup, openingPrinciples, positionalThemes, stalemateMoves, structureTags } from '../src/chess/structure.ts';
import { imbalancesOf, visualQuestions } from '../src/output/practices.ts';
import type { TrainingPosition } from '../src/output/record.ts';

function position(change: Partial<TrainingPosition>): TrainingPosition {
	return {
		ply: 20,
		moveNumber: 11,
		sideToMove: 'white',
		fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
		category: 'tactics',
		categories: ['tactics'],
		themes: [],
		difficulty: 'intermediate',
		difficultyRating: 1200,
		qualityScore: 60,
		bestMove: { san: 'O-O', uci: 'e1g1' },
		bestReply: null,
		playedMove: { rank: 0, san: 'd3', uci: 'd2d3', cp: 0, mate: null, loss: 0, isBest: false, refutation: null },
		candidateMoves: [
			{ rank: 1, san: 'O-O', uci: 'e1g1', cp: 30, mate: null, loss: 0 },
			{ rank: 2, san: 'd3', uci: 'd2d3', cp: 20, mate: null, loss: 10 },
		],
		principalVariations: [],
		calculationDepth: 1,
		engineDepth: 18,
		...change,
	};
}

describe('board features', () => {
	it('finds isolated, doubled and passed pawns', () => {
		// White a2, c3, c4, e5; Black b7, d6, h5
		const features = boardFeatures('4k3/1p6/3p4/4P2p/2P5/2P5/P7/4K3 w - - 0 1');
		expect(features.white.isolated).toEqual(['a2', 'c3', 'c4', 'e5']);
		expect(features.white.doubled).toEqual(['c3', 'c4']);
		expect(features.white.passed).toEqual([]);
		expect(features.black.passed).toEqual(['h5']);
		expect(features.black.isolated).toEqual(['b7', 'd6', 'h5']);
		expect(features.black.iqp).toBe(true);
	});

	it('marks a pawn backward when no pawn can guard it and its stop square is hit by an enemy pawn', () => {
		// Black d6: its neighbour c5 is already past it, and the c4 pawn hits d5
		const features = boardFeatures('4k3/8/3p4/2p1P3/2P5/8/8/4K3 b - - 0 1');
		expect(features.black.backward).toEqual(['d6']);
		expect(features.white.backward).toEqual([]);
	});

	it('finds outposts no enemy pawn can attack, guarded by a pawn', () => {
		// c5 can be hit by the b7 pawn, e5 by the f7 pawn
		const features = boardFeatures('4k3/pp3ppp/8/3p4/3P4/8/PP3PPP/4K3 w - - 0 1');
		expect(features.white.outposts).toEqual([]);
		// with the b- and f-pawns gone, nothing can ever hit c5 or e5
		const open = boardFeatures('4k3/p5pp/8/3p4/3P4/8/P5PP/4K3 w - - 0 1');
		expect(open.white.outposts).toEqual(['c5', 'e5']);
		expect(open.black.outposts).toEqual(['c4', 'e4']);
	});

	it('finds open and half-open files, an isolated d-pawn and hanging pawns', () => {
		const iqp = boardFeatures('4k3/pp3ppp/4p3/8/3P4/8/PP3PPP/4K3 w - - 0 1');
		expect(iqp.openFiles).toEqual(['c']);
		expect(iqp.white.halfOpen).toEqual(['e']);
		expect(iqp.black.halfOpen).toEqual(['d']);
		expect(iqp.white.iqp).toBe(true);
		const hanging = boardFeatures('4k3/pp3ppp/4p3/8/2PP4/8/P4PPP/4K3 w - - 0 1');
		expect(hanging.white.hangingPawns).toBe(true);
		expect(structureTags(hanging)).toContain('hangingPawns');
	});

	it('tells the bishop pair from opposite-coloured bishops', () => {
		expect(boardFeatures('4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1').bishopPair).toBe('white');
		const opposite = boardFeatures('4kb2/8/8/8/8/8/8/4KB2 w - - 0 1');
		expect(opposite.oppositeBishops).toBe(true);
		expect(structureTags(opposite)).toEqual(['oppositeBishops']);
	});

	it('groups endgame types for practice', () => {
		expect(endgameGroup('knightVsBishop')).toBe('minor');
		expect(endgameGroup('queenAndPieces')).toBe('queen');
		expect(endgameGroup('rookAndMinor')).toBe('mixed');
		expect(endgameGroup(null)).toBeNull();
	});
});

describe('move themes', () => {
	it('names what a quiet move does with the structure', () => {
		expect(positionalThemes('4k3/p5pp/8/3p4/3P2N1/8/P5PP/4K3 w - - 0 1', 'g4e5')).toEqual(['outpost']);
		// the knight now hits the isolated a7 pawn
		expect(positionalThemes('4k3/p5pp/8/3p4/3P4/2N5/P5PP/4K3 w - - 0 1', 'c3b5')).toEqual(['weakPawn']);
		expect(positionalThemes('4k3/pp3ppp/4p3/8/3P4/8/PP3PPP/R3K3 w - - 0 1', 'a1c1')).toEqual(['openFile']);
	});

	it('lists the stalemating moves', () => {
		expect(stalemateMoves('k7/8/2K5/8/8/8/8/1Q6 w - - 0 1')).toEqual(['b1b6']);
		expect(stalemateMoves('7k/5K2/8/8/8/8/8/6Q1 w - - 0 1')).toEqual(['g1g6', 'g1b1']);
	});

	it('knows the opening rules of thumb', () => {
		const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
		expect(openingPrinciples(fen, 'e1g1')).toEqual(['castle']);
		expect(openingPrinciples(fen, 'b1c3')).toContain('develop');
		expect(openingPrinciples(new Chess().fen(), 'e2e4')).toEqual(['centre']);
	});
});

describe('enriched fields', () => {
	it('passes the move only when the side to move is not in check', () => {
		expect(passedFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1')).toBe('4k3/8/8/8/8/8/8/4K2R b K - 0 1');
		expect(passedFen('4k3/8/8/8/8/8/8/4K2r w - - 0 1')).toBeNull();
	});

	it('bands quiet positions only, leaving borderline scores out', () => {
		expect(evalBandOf(position({}))).toBe('equal');
		const better = (cp: number) => position({ candidateMoves: [{ rank: 1, san: 'O-O', uci: 'e1g1', cp, mate: null, loss: 0 }, { rank: 2, san: 'd3', uci: 'd2d3', cp: cp - 20, mate: null, loss: 20 }] });
		expect(evalBandOf(better(150))).toBe('white');
		expect(evalBandOf(better(-200))).toBe('black');
		expect(evalBandOf(better(80))).toBeNull();
		// the best move is a capture: not quiet
		const capture = position({ candidateMoves: [{ rank: 1, san: 'Nxe5', uci: 'f3e5', cp: 30, mate: null, loss: 0 }, { rank: 2, san: 'd3', uci: 'd2d3', cp: 20, mate: null, loss: 10 }] });
		expect(evalBandOf(capture)).toBeNull();
	});

	it('takes the game’s losing capture as the tempting move, with its refutation', () => {
		const tempting = temptingOf(
			position({
				playedMove: {
					rank: 0,
					san: 'Nxe5',
					uci: 'f3e5',
					cp: -150,
					mate: null,
					loss: 180,
					isBest: false,
					refutation: { rank: 0, cp: -150, mate: null, san: ['Nxe5', 'Nxe5'], uci: ['f3e5', 'c6e5'] },
				},
			}),
		);
		expect(tempting).toMatchObject({ move: { uci: 'f3e5' }, refutation: ['c6e5'], played: true, loss: 180 });
		expect(temptingOf(position({}))).toBeNull();
	});

	it('keeps "positional" only when the best move uses the structure', () => {
		const quiet = position({ category: 'positional', categories: ['positional'] });
		expect(fixPositional(quiet)).toMatchObject({ category: 'criticalDecision', categories: ['criticalDecision'] });
		const rook = position({
			fen: '4k3/pp3ppp/4p3/8/3P4/8/PP3PPP/R3K3 w - - 0 1',
			bestMove: { san: 'Rc1', uci: 'a1c1' },
			category: 'positional',
			categories: ['positional', 'defense'],
		});
		expect(fixPositional(rook)).toMatchObject({ category: 'positional', themes: ['openFile'] });
	});
});

describe('practice items', () => {
	it('asks visualisation questions that only the played moves answer', () => {
		const start = new Chess();
		const end = new Chess();
		const touched: Square[] = [];
		for (const san of ['e4', 'e5', 'Nf3']) {
			const move = end.move(san);
			touched.push(move.from, move.to);
		}
		const questions = visualQuestions(start, end, touched);
		const piece = questions.find((question) => question.kind === 'piece');
		expect(piece).toMatchObject({ square: 'f3', answer: 'wn' });
		expect(piece && piece.kind === 'piece' && piece.options).toContain('wn');
		// Black to move: is e5 attacked by White? the knight on f3 hits it now
		expect(questions.find((question) => question.kind === 'attacked')).toMatchObject({ square: 'e5', by: 'white', answer: true });
	});

	it('weighs imbalances for Who is better?', () => {
		const list = imbalancesOf('4k3/8/8/8/3B4/2B5/PP6/4K3 w - - 0 1');
		expect(list.map((item) => item.kind)).toEqual(expect.arrayContaining(['material', 'bishopPair', 'passedPawn']));
		expect(list.every((item) => item.side === 'white')).toBe(true);
	});
});
